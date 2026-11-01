package br.ufgd.gdcenter.game;

import br.ufgd.gdcenter.map.MapData;
import br.ufgd.gdcenter.map.MapService;
import br.ufgd.gdcenter.movement.MovementSystem;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Authoritative 60 Hz game loop running on a single ScheduledExecutorService thread.
 * All game state mutations (joins, leaves, input draining, movement stepping, snapshots)
 * happen exclusively on this thread so no locks are needed around player state.
 */
@Service
public class GameLoopService {

    private static final Logger log = LoggerFactory.getLogger(GameLoopService.class);
    private static final int MAX_INPUTS_PER_TICK = 8;
    private static final int SNAPSHOT_INTERVAL_TICKS = 3;
    private static final double MAX_PITCH = Math.toRadians(89.0);

    private sealed interface LoopCommand permits JoinCommand, InputCommand, LeaveCommand {}

    private record JoinCommand(WebSocketSession session, String rawName) implements LoopCommand {}

    private record InputCommand(
            String sessionId,
            long seq,
            boolean forward,
            boolean back,
            boolean left,
            boolean right,
            boolean run,
            boolean jump,
            double yaw,
            double pitch
    ) implements LoopCommand {}

    private record LeaveCommand(String sessionId) implements LoopCommand {}

    private final MapService mapService;
    private final ObjectMapper objectMapper;
    private final ConcurrentLinkedQueue<LoopCommand> commandQueue = new ConcurrentLinkedQueue<>();

    // Owned exclusively by the game loop thread:
    private final Map<String, PlayerSessionState> playersBySessionId = new LinkedHashMap<>();
    private final Map<String, String> activeNamesLower = new LinkedHashMap<>(); // lowerName -> sessionId
    private long currentTick = 0L;
    private int nextSpawnIndex = 0;

    private ScheduledExecutorService executor;

    public GameLoopService(MapService mapService, ObjectMapper objectMapper) {
        this.mapService = mapService;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    public void start() {
        int tickRate = mapService.getMapData().physics().tickRate();
        long periodNanos = Math.round(1_000_000_000.0 / tickRate);

        this.executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "gdcenter-gameloop");
            t.setDaemon(true);
            return t;
        });
        this.executor.scheduleAtFixedRate(this::runTickSafely, 0L, periodNanos, TimeUnit.NANOSECONDS);
        log.info("Authoritative GameLoop started at {} Hz ({} ns/tick)", tickRate, periodNanos);
    }

    @PreDestroy
    public void stop() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    public void enqueueJoin(WebSocketSession session, String rawName) {
        commandQueue.offer(new JoinCommand(session, rawName));
    }

    public void enqueueInput(
            String sessionId,
            long seq,
            boolean forward,
            boolean back,
            boolean left,
            boolean right,
            boolean run,
            boolean jump,
            double yaw,
            double pitch
    ) {
        commandQueue.offer(new InputCommand(
                sessionId, seq, forward, back, left, right, run, jump, yaw, pitch
        ));
    }

    public void enqueueLeave(String sessionId) {
        commandQueue.offer(new LeaveCommand(sessionId));
    }

    public void sendPong(WebSocketSession session, double t) {
        if (!Double.isFinite(t)) {
            return;
        }
        sendJson(session, new ProtocolMessages.PongMessage(t));
    }

    public void sendErrorAndClose(WebSocketSession session, String message) {
        sendJson(session, new ProtocolMessages.ErrorMessage(message));
        try {
            session.close(CloseStatus.POLICY_VIOLATION);
        } catch (IOException e) {
            log.debug("Failed to close session {}: {}", session.getId(), e.getMessage());
        }
    }

    private void runTickSafely() {
        try {
            tick();
        } catch (Throwable t) {
            log.error("Unexpected error in GameLoop tick {}", currentTick, t);
        }
    }

    private void tick() {
        currentTick++;

        // 1. Drain all enqueued network commands (joins, leaves, inputs)
        LoopCommand cmd;
        while ((cmd = commandQueue.poll()) != null) {
            switch (cmd) {
                case JoinCommand joinCmd -> handleJoin(joinCmd);
                case InputCommand inputCmd -> handleInputEnqueue(inputCmd);
                case LeaveCommand leaveCmd -> handleLeave(leaveCmd);
            }
        }

        // 2. Drain up to 8 inputs per player; each input advances simulation by 1 fixed step
        MapData map = mapService.getMapData();
        for (PlayerSessionState player : playersBySessionId.values()) {
            for (int i = 0; i < MAX_INPUTS_PER_TICK; i++) {
                PlayerSessionState.QueuedInput queued = player.pollInput();
                if (queued == null) {
                    break;
                }
                MovementSystem.State nextState = MovementSystem.step(
                        player.toMovementState(),
                        queued.input(),
                        map.physics(),
                        map.ground(),
                        map.bounds(),
                        map.boxes()
                );
                player.applyStep(nextState, queued.input().yaw(), queued.input().pitch(), queued.seq());
            }
        }

        // 3. Every 3rd tick (20 Hz), broadcast a full-precision snapshot to all joined players
        if (currentTick % SNAPSHOT_INTERVAL_TICKS == 0 && !playersBySessionId.isEmpty()) {
            broadcastSnapshot();
        }
    }

    private void handleJoin(JoinCommand cmd) {
        WebSocketSession session = cmd.session();
        if (!session.isOpen()) {
            return;
        }
        if (playersBySessionId.containsKey(session.getId())) {
            return;
        }

        String trimmed = cmd.rawName() == null ? "" : cmd.rawName().trim();
        if (trimmed.isEmpty() || trimmed.length() > 16) {
            sendErrorAndClose(session, "O nome deve ter entre 1 e 16 caracteres.");
            return;
        }

        String lower = trimmed.toLowerCase(Locale.ROOT);
        if (activeNamesLower.containsKey(lower)) {
            sendErrorAndClose(session, "Este nome já está em uso por outro jogador.");
            return;
        }

        MapData map = mapService.getMapData();
        List<MapData.SpawnPoint> spawns = map.spawnPoints();
        MapData.SpawnPoint spawn = spawns.get(nextSpawnIndex % spawns.size());
        nextSpawnIndex = (nextSpawnIndex + 1) % spawns.size();

        String playerId = UUID.randomUUID().toString();
        PlayerSessionState newPlayer = new PlayerSessionState(
                playerId,
                trimmed,
                session,
                spawn.x(),
                spawn.y(),
                spawn.z(),
                spawn.yaw()
        );

        playersBySessionId.put(session.getId(), newPlayer);
        activeNamesLower.put(lower, session.getId());

        int tickRate = map.physics().tickRate();
        int snapshotRate = tickRate / SNAPSHOT_INTERVAL_TICKS;

        List<ProtocolMessages.PlayerSummaryPayload> allPlayers = new ArrayList<>(playersBySessionId.size());
        for (PlayerSessionState existing : playersBySessionId.values()) {
            allPlayers.add(existing.toSummaryPayload());
        }

        // Send welcome to the newly joined player
        ProtocolMessages.WelcomeMessage welcome = new ProtocolMessages.WelcomeMessage(
                playerId,
                tickRate,
                snapshotRate,
                newPlayer.toStatePayload(),
                allPlayers
        );
        sendJson(session, welcome);

        // Broadcast player_joined to all OTHER connected players
        ProtocolMessages.PlayerJoinedMessage joinedMsg = new ProtocolMessages.PlayerJoinedMessage(
                playerId,
                trimmed,
                newPlayer.toStatePayload()
        );
        String serializedJoined = toJson(joinedMsg);
        if (serializedJoined != null) {
            for (PlayerSessionState other : playersBySessionId.values()) {
                if (!other.getId().equals(playerId)) {
                    sendRaw(other.getSession(), serializedJoined);
                }
            }
        }
    }

    private void handleInputEnqueue(InputCommand cmd) {
        PlayerSessionState player = playersBySessionId.get(cmd.sessionId());
        if (player == null) {
            return;
        }
        // Sanitize numbers: ignore NaN/Infinity, clamp pitch to +-89 degrees
        if (!Double.isFinite(cmd.yaw()) || !Double.isFinite(cmd.pitch()) || cmd.seq() <= 0) {
            return;
        }
        double clampedPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, cmd.pitch()));

        MovementSystem.Input sanitizedInput = new MovementSystem.Input(
                cmd.forward(),
                cmd.back(),
                cmd.left(),
                cmd.right(),
                cmd.run(),
                cmd.jump(),
                cmd.yaw(),
                clampedPitch
        );
        player.enqueueInput(new PlayerSessionState.QueuedInput(cmd.seq(), sanitizedInput));
    }

    private void handleLeave(LeaveCommand cmd) {
        PlayerSessionState removed = playersBySessionId.remove(cmd.sessionId());
        if (removed == null) {
            return;
        }
        activeNamesLower.remove(removed.getName().toLowerCase(Locale.ROOT));

        ProtocolMessages.PlayerLeftMessage leftMsg = new ProtocolMessages.PlayerLeftMessage(removed.getId());
        String serialized = toJson(leftMsg);
        if (serialized != null) {
            for (PlayerSessionState remaining : playersBySessionId.values()) {
                sendRaw(remaining.getSession(), serialized);
            }
        }
    }

    private void broadcastSnapshot() {
        List<ProtocolMessages.SnapshotPlayerEntry> entries = new ArrayList<>(playersBySessionId.size());
        for (PlayerSessionState player : playersBySessionId.values()) {
            entries.add(player.toSnapshotEntry());
        }
        ProtocolMessages.SnapshotMessage snapshot = new ProtocolMessages.SnapshotMessage(currentTick, entries);
        String serialized = toJson(snapshot);
        if (serialized == null) {
            return;
        }
        for (PlayerSessionState player : playersBySessionId.values()) {
            sendRaw(player.getSession(), serialized);
        }
    }

    private void sendJson(WebSocketSession session, Object payload) {
        String json = toJson(payload);
        if (json != null) {
            sendRaw(session, json);
        }
    }

    private String toJson(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (Exception e) {
            log.warn("Failed to serialize WebSocket message: {}", e.getMessage());
            return null;
        }
    }

    private void sendRaw(WebSocketSession session, String json) {
        if (!session.isOpen()) {
            return;
        }
        try {
            session.sendMessage(new TextMessage(json));
        } catch (Exception e) {
            log.debug("Failed to send message to session {}: {}", session.getId(), e.getMessage());
        }
    }
}
