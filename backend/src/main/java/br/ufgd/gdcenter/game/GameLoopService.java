package br.ufgd.gdcenter.game;

import br.ufgd.gdcenter.dto.inbound.BuildAction;
import br.ufgd.gdcenter.dto.inbound.JoinRequestDTO;
import br.ufgd.gdcenter.dto.inbound.PlayerInputDTO;
import br.ufgd.gdcenter.map.MapData;
import br.ufgd.gdcenter.map.MapService;
import br.ufgd.gdcenter.movement.ColliderBox;
import br.ufgd.gdcenter.movement.MovementSystem;
import br.ufgd.gdcenter.structure.BuildCommandProcessor;
import br.ufgd.gdcenter.structure.StructureRegistry;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.WebSocketSession;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
public class GameLoopService {

    private static final Logger log = LoggerFactory.getLogger(GameLoopService.class);
    private static final int MAX_INPUTS_PER_TICK = 8;
    private static final int SNAPSHOT_INTERVAL_TICKS = 3;

    private final MapService mapService;
    private final PlayerRegistry playerRegistry;
    private final StructureRegistry structureRegistry;
    private final BuildCommandProcessor buildCommandProcessor;
    private final WebSocketBroadcaster broadcaster;
    private final ConcurrentLinkedQueue<LoopCommand> commandQueue = new ConcurrentLinkedQueue<>();

    private long currentTick = 0L;
    private ScheduledExecutorService executor;

    public GameLoopService(
            MapService mapService,
            PlayerRegistry playerRegistry,
            StructureRegistry structureRegistry,
            BuildCommandProcessor buildCommandProcessor,
            WebSocketBroadcaster broadcaster
    ) {
        this.mapService = mapService;
        this.playerRegistry = playerRegistry;
        this.structureRegistry = structureRegistry;
        this.buildCommandProcessor = buildCommandProcessor;
        this.broadcaster = broadcaster;
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

    public void enqueueJoin(WebSocketSession session, JoinRequestDTO request) {
        commandQueue.offer(new LoopCommand.JoinCommand(session, request));
    }

    public void enqueueInput(String sessionId, PlayerInputDTO input) {
        commandQueue.offer(new LoopCommand.InputCommand(sessionId, input));
    }

    public void enqueueBuild(String sessionId, BuildAction action) {
        commandQueue.offer(new LoopCommand.BuildCommand(sessionId, action));
    }

    public void enqueueLeave(String sessionId) {
        commandQueue.offer(new LoopCommand.LeaveCommand(sessionId));
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

        LoopCommand cmd;
        while ((cmd = commandQueue.poll()) != null) {
            switch (cmd) {
                case LoopCommand.JoinCommand joinCmd -> handleJoin(joinCmd);
                case LoopCommand.InputCommand inputCmd -> handleInputEnqueue(inputCmd);
                case LoopCommand.BuildCommand buildCmd -> handleBuildEnqueue(buildCmd);
                case LoopCommand.LeaveCommand leaveCmd -> handleLeave(leaveCmd);
            }
        }

        stepAllPlayers();
        buildCommandProcessor.processAllPlayersBuildQueues(System.nanoTime());

        if (currentTick % SNAPSHOT_INTERVAL_TICKS == 0 && !playerRegistry.isEmpty()) {
            broadcaster.broadcastSnapshot(
                    currentTick,
                    playerRegistry.buildSnapshotEntries(),
                    playerRegistry.getAllPlayers()
            );
        }
    }

    private void stepAllPlayers() {
        MapData map = mapService.getMapData();
        List<ColliderBox> colliders = structureRegistry.getColliderBoxes();

        for (PlayerSessionState player : playerRegistry.getAllPlayers()) {
            for (int i = 0; i < MAX_INPUTS_PER_TICK; i++) {
                PlayerInputDTO queued = player.pollInput();
                if (queued == null) {
                    break;
                }
                MovementSystem.State nextState = MovementSystem.step(
                        player.toMovementState(),
                        queued.toMovementInput(),
                        map.physics(),
                        map.ground(),
                        map.bounds(),
                        colliders
                );
                player.applyStep(nextState, queued.yaw(), queued.pitch(), queued.seq());
            }
        }
    }

    private void handleJoin(LoopCommand.JoinCommand cmd) {
        WebSocketSession session = cmd.session();
        if (!session.isOpen() || playerRegistry.hasSession(session.getId())) {
            return;
        }

        Optional<String> validationError = cmd.request().validate();
        if (validationError.isPresent()) {
            broadcaster.sendErrorAndClose(session, validationError.get());
            return;
        }

        String playerName = cmd.request().name();
        if (playerRegistry.isNameTaken(playerName)) {
            broadcaster.sendErrorAndClose(session, "Este nome já está em uso por outro jogador.");
            return;
        }

        MapData map = mapService.getMapData();
        PlayerSessionState newPlayer = playerRegistry.registerPlayer(
                session,
                playerName,
                map.spawnPoints()
        );

        int tickRate = map.physics().tickRate();
        int snapshotRate = tickRate / SNAPSHOT_INTERVAL_TICKS;

        broadcaster.sendWelcome(
                newPlayer,
                tickRate,
                snapshotRate,
                playerRegistry.buildPlayerSummaries(),
                structureRegistry.getAllStructures()
        );
        broadcaster.broadcastPlayerJoined(newPlayer, playerRegistry.getAllPlayers());
    }

    private void handleInputEnqueue(LoopCommand.InputCommand cmd) {
        PlayerSessionState player = playerRegistry.getBySessionId(cmd.sessionId());
        if (player != null) {
            player.enqueueInput(cmd.input());
        }
    }

    private void handleBuildEnqueue(LoopCommand.BuildCommand cmd) {
        PlayerSessionState player = playerRegistry.getBySessionId(cmd.sessionId());
        if (player != null) {
            player.enqueueBuildAction(cmd.action());
        }
    }

    private void handleLeave(LoopCommand.LeaveCommand cmd) {
        PlayerSessionState removed = playerRegistry.removeBySessionId(cmd.sessionId());
        if (removed != null) {
            broadcaster.broadcastPlayerLeft(removed.getId(), playerRegistry.getAllPlayers());
        }
    }
}
