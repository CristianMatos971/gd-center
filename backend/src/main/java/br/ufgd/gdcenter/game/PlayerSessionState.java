package br.ufgd.gdcenter.game;

import br.ufgd.gdcenter.dto.inbound.BuildAction;
import br.ufgd.gdcenter.dto.inbound.PlayerInputDTO;
import br.ufgd.gdcenter.dto.outbound.PlayerStateDTO;
import br.ufgd.gdcenter.dto.outbound.PlayerSummaryDTO;
import br.ufgd.gdcenter.dto.outbound.SnapshotPlayerDTO;
import br.ufgd.gdcenter.movement.MovementSystem;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayDeque;
import java.util.Deque;

public class PlayerSessionState {

    public static final int MAX_INPUT_QUEUE_SIZE = 120;
    public static final int MAX_BUILD_QUEUE_SIZE = 64;
    public static final int MAX_BUILD_COMMANDS_PER_SECOND = 10;
    private static final long ONE_SECOND_NANOS = 1_000_000_000L;

    private final String id;
    private final String name;
    private final WebSocketSession session;
    private final Deque<PlayerInputDTO> inputQueue = new ArrayDeque<>(MAX_INPUT_QUEUE_SIZE);
    private final Deque<BuildAction> buildQueue = new ArrayDeque<>(MAX_BUILD_QUEUE_SIZE);
    private final Deque<Long> buildCommandTimestampsNanos = new ArrayDeque<>(MAX_BUILD_COMMANDS_PER_SECOND + 1);

    private double x;
    private double y;
    private double z;
    private double vy;
    private boolean onGround;
    private double yaw;
    private double pitch;
    private long lastProcessedSeq;

    public PlayerSessionState(
            String id,
            String name,
            WebSocketSession session,
            double x,
            double y,
            double z,
            double yaw
    ) {
        this.id = id;
        this.name = name;
        this.session = session;
        this.x = x;
        this.y = y;
        this.z = z;
        this.vy = 0.0;
        this.onGround = true;
        this.yaw = yaw;
        this.pitch = 0.0;
        this.lastProcessedSeq = 0L;
    }

    public void enqueueInput(PlayerInputDTO input) {
        if (inputQueue.size() >= MAX_INPUT_QUEUE_SIZE) {
            inputQueue.pollFirst();
        }
        inputQueue.addLast(input);
    }

    public PlayerInputDTO pollInput() {
        return inputQueue.pollFirst();
    }

    public void enqueueBuildAction(BuildAction action) {
        if (buildQueue.size() >= MAX_BUILD_QUEUE_SIZE) {
            buildQueue.pollFirst();
        }
        buildQueue.addLast(action);
    }

    public BuildAction pollBuildAction() {
        return buildQueue.pollFirst();
    }

    public boolean tryConsumeBuildRateLimit(long nowNanos) {
        long cutoff = nowNanos - ONE_SECOND_NANOS;
        while (!buildCommandTimestampsNanos.isEmpty() && buildCommandTimestampsNanos.peekFirst() <= cutoff) {
            buildCommandTimestampsNanos.pollFirst();
        }
        if (buildCommandTimestampsNanos.size() >= MAX_BUILD_COMMANDS_PER_SECOND) {
            return false;
        }
        buildCommandTimestampsNanos.addLast(nowNanos);
        return true;
    }

    public void applyStep(MovementSystem.State nextState, double yaw, double pitch, long seq) {
        this.x = nextState.x();
        this.y = nextState.y();
        this.z = nextState.z();
        this.vy = nextState.vy();
        this.onGround = nextState.onGround();
        this.yaw = yaw;
        this.pitch = pitch;
        if (seq > this.lastProcessedSeq) {
            this.lastProcessedSeq = seq;
        }
    }

    public MovementSystem.State toMovementState() {
        return new MovementSystem.State(x, y, z, vy, onGround);
    }

    public PlayerStateDTO toStateDTO() {
        return new PlayerStateDTO(x, y, z, vy, onGround, yaw, pitch);
    }

    public PlayerSummaryDTO toSummaryDTO() {
        return new PlayerSummaryDTO(id, name, toStateDTO());
    }

    public SnapshotPlayerDTO toSnapshotDTO() {
        return new SnapshotPlayerDTO(
                id, x, y, z, vy, onGround, yaw, pitch, lastProcessedSeq
        );
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public WebSocketSession getSession() {
        return session;
    }

    public long getLastProcessedSeq() {
        return lastProcessedSeq;
    }
}
