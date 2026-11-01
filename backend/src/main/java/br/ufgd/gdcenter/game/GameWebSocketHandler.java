package br.ufgd.gdcenter.game;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket handler for /ws.
 * Wraps sessions in ConcurrentWebSocketSessionDecorator for thread-safe outbound sends,
 * parses inbound JSON text frames, sanitizes fields, and enqueues commands into GameLoopService.
 */
@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(GameWebSocketHandler.class);
    private static final int SEND_TIME_LIMIT_MS = 2000;
    private static final int BUFFER_SIZE_LIMIT_BYTES = 64 * 1024;

    private final GameLoopService gameLoopService;
    private final ObjectMapper objectMapper;
    private final Map<String, WebSocketSession> decoratedSessions = new ConcurrentHashMap<>();

    public GameWebSocketHandler(GameLoopService gameLoopService, ObjectMapper objectMapper) {
        this.gameLoopService = gameLoopService;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        WebSocketSession decorated = new ConcurrentWebSocketSessionDecorator(
                session, SEND_TIME_LIMIT_MS, BUFFER_SIZE_LIMIT_BYTES
        );
        decoratedSessions.put(session.getId(), decorated);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        WebSocketSession decorated = decoratedSessions.getOrDefault(session.getId(), session);
        JsonNode root;
        try {
            root = objectMapper.readTree(message.getPayload());
        } catch (Exception e) {
            log.warn("Malformed JSON from session {}: {}", session.getId(), e.getMessage());
            return;
        }

        if (root == null || !root.isObject()) {
            return;
        }

        String type = root.path("type").asString("");
        switch (type) {
            case "join" -> {
                String name = root.path("name").asString("");
                gameLoopService.enqueueJoin(decorated, name);
            }
            case "input" -> {
                JsonNode seqNode = root.get("seq");
                JsonNode yawNode = root.get("yaw");
                JsonNode pitchNode = root.get("pitch");
                if (seqNode == null || !seqNode.isNumber()
                        || yawNode == null || !yawNode.isNumber()
                        || pitchNode == null || !pitchNode.isNumber()) {
                    return;
                }
                long seq = seqNode.asLong(-1L);
                double yaw = yawNode.asDouble(Double.NaN);
                double pitch = pitchNode.asDouble(Double.NaN);
                if (!Double.isFinite(yaw) || !Double.isFinite(pitch) || seq <= 0) {
                    return;
                }

                boolean forward = root.path("forward").asBoolean(false);
                boolean back = root.path("back").asBoolean(false);
                boolean left = root.path("left").asBoolean(false);
                boolean right = root.path("right").asBoolean(false);
                boolean run = root.path("run").asBoolean(false);
                boolean jump = root.path("jump").asBoolean(false);

                gameLoopService.enqueueInput(
                        session.getId(), seq, forward, back, left, right, run, jump, yaw, pitch
                );
            }
            case "ping" -> {
                JsonNode tNode = root.get("t");
                if (tNode != null && tNode.isNumber()) {
                    double t = tNode.asDouble(Double.NaN);
                    if (Double.isFinite(t)) {
                        gameLoopService.sendPong(decorated, t);
                    }
                }
            }
            default -> log.debug("Unknown WebSocket message type '{}' from session {}", type, session.getId());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        decoratedSessions.remove(session.getId());
        gameLoopService.enqueueLeave(session.getId());
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.debug("Transport error on session {}: {}", session.getId(), exception.getMessage());
        decoratedSessions.remove(session.getId());
        gameLoopService.enqueueLeave(session.getId());
    }
}
