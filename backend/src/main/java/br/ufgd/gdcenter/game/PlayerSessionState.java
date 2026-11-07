package br.ufgd.gdcenter.game;

import br.ufgd.gdcenter.movement.MovementSystem;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayDeque;
import java.util.Deque;

public class PlayerSessionState {

    public static final int MAX_INPUT_QUEUE_SIZE = 120;

    public record QueuedInput(long seq, MovementSystem.Input input) {}

    private final String id;
    private final String name;
    private final WebSocketSession session;
    private final Deque<QueuedInput> inputQueue = new ArrayDeque<>(MAX_INPUT_QUEUE_SIZE);

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

    public void enqueueInput(QueuedInput queuedInput) {
        if (inputQueue.size() >= MAX_INPUT_QUEUE_SIZE) {
            inputQueue.pollFirst();
        }
        inputQueue.addLast(queuedInput);
    }

    public QueuedInput pollInput() {
        return inputQueue.pollFirst();
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

    public ProtocolMessages.PlayerStatePayload toStatePayload() {
        return new ProtocolMessages.PlayerStatePayload(x, y, z, vy, onGround, yaw, pitch);
    }

    public ProtocolMessages.PlayerSummaryPayload toSummaryPayload() {
        return new ProtocolMessages.PlayerSummaryPayload(id, name, toStatePayload());
    }

    public ProtocolMessages.SnapshotPlayerEntry toSnapshotEntry() {
        return new ProtocolMessages.SnapshotPlayerEntry(
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
