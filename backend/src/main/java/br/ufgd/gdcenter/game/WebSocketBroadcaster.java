package br.ufgd.gdcenter.game;

import br.ufgd.gdcenter.dto.outbound.ErrorResponseDTO;
import br.ufgd.gdcenter.dto.outbound.PlayerJoinedResponseDTO;
import br.ufgd.gdcenter.dto.outbound.PlayerLeftResponseDTO;
import br.ufgd.gdcenter.dto.outbound.PlayerSummaryDTO;
import br.ufgd.gdcenter.dto.outbound.PongResponseDTO;
import br.ufgd.gdcenter.dto.outbound.SnapshotPlayerDTO;
import br.ufgd.gdcenter.dto.outbound.SnapshotResponseDTO;
import br.ufgd.gdcenter.dto.outbound.WelcomeResponseDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.Collection;
import java.util.List;

@Component
public class WebSocketBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(WebSocketBroadcaster.class);

    private final ObjectMapper objectMapper;

    public WebSocketBroadcaster(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void sendWelcome(
            PlayerSessionState newPlayer,
            int tickRate,
            int snapshotRate,
            List<PlayerSummaryDTO> allPlayers
    ) {
        WelcomeResponseDTO welcome = new WelcomeResponseDTO(
                newPlayer.getId(),
                tickRate,
                snapshotRate,
                newPlayer.toStateDTO(),
                allPlayers
        );
        sendJson(newPlayer.getSession(), welcome);
    }

    public void broadcastPlayerJoined(
            PlayerSessionState newPlayer,
            Collection<PlayerSessionState> allPlayers
    ) {
        PlayerJoinedResponseDTO joinedMsg = new PlayerJoinedResponseDTO(
                newPlayer.getId(),
                newPlayer.getName(),
                newPlayer.toStateDTO()
        );
        String serialized = toJson(joinedMsg);
        if (serialized == null) {
            return;
        }
        for (PlayerSessionState other : allPlayers) {
            if (!other.getId().equals(newPlayer.getId())) {
                sendRaw(other.getSession(), serialized);
            }
        }
    }

    public void broadcastPlayerLeft(
            String removedPlayerId,
            Collection<PlayerSessionState> remainingPlayers
    ) {
        PlayerLeftResponseDTO leftMsg = new PlayerLeftResponseDTO(removedPlayerId);
        String serialized = toJson(leftMsg);
        if (serialized == null) {
            return;
        }
        for (PlayerSessionState remaining : remainingPlayers) {
            sendRaw(remaining.getSession(), serialized);
        }
    }

    public void broadcastSnapshot(
            long tick,
            List<SnapshotPlayerDTO> entries,
            Collection<PlayerSessionState> allPlayers
    ) {
        SnapshotResponseDTO snapshot = new SnapshotResponseDTO(tick, entries);
        String serialized = toJson(snapshot);
        if (serialized == null) {
            return;
        }
        for (PlayerSessionState player : allPlayers) {
            sendRaw(player.getSession(), serialized);
        }
    }

    public void sendPong(WebSocketSession session, double t) {
        sendJson(session, new PongResponseDTO(t));
    }

    public void sendErrorAndClose(WebSocketSession session, String message) {
        sendJson(session, new ErrorResponseDTO(message));
        try {
            session.close(CloseStatus.POLICY_VIOLATION);
        } catch (IOException e) {
            log.debug("Failed to close session {}: {}", session.getId(), e.getMessage());
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
