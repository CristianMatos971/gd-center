package br.ufgd.gdcenter.game;

import br.ufgd.gdcenter.dto.inbound.BuildAction;
import br.ufgd.gdcenter.dto.inbound.JoinRequestDTO;
import br.ufgd.gdcenter.dto.inbound.PingRequestDTO;
import br.ufgd.gdcenter.dto.inbound.PlayerInputDTO;
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

@Component
public class GameWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(GameWebSocketHandler.class);
    private static final int SEND_TIME_LIMIT_MS = 2000;
    private static final int BUFFER_SIZE_LIMIT_BYTES = 64 * 1024;

    private final GameLoopService gameLoopService;
    private final WebSocketBroadcaster broadcaster;
    private final ObjectMapper objectMapper;
    private final Map<String, WebSocketSession> decoratedSessions = new ConcurrentHashMap<>();

    public GameWebSocketHandler(
            GameLoopService gameLoopService,
            WebSocketBroadcaster broadcaster,
            ObjectMapper objectMapper
    ) {
        this.gameLoopService = gameLoopService;
        this.broadcaster = broadcaster;
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
            gameLoopService.enqueueBuild(session.getId(), new BuildAction.Invalid("Malformed JSON"));
            return;
        }

        if (root == null || !root.isObject()) {
            log.warn("Non-object JSON from session {}", session.getId());
            gameLoopService.enqueueBuild(session.getId(), new BuildAction.Invalid("Non-object JSON"));
            return;
        }

        String type = root.path("type").asString("");
        switch (type) {
            case "join" -> gameLoopService.enqueueJoin(decorated, JoinRequestDTO.fromJson(root));
            case "input" -> PlayerInputDTO.fromJson(root)
                    .ifPresent(input -> gameLoopService.enqueueInput(session.getId(), input));
            case "ping" -> PingRequestDTO.fromJson(root)
                    .ifPresent(ping -> broadcaster.sendPong(decorated, ping.t()));
            case "build_place", "build_update", "build_remove" ->
                    gameLoopService.enqueueBuild(session.getId(), BuildAction.fromJson(type, root));
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
