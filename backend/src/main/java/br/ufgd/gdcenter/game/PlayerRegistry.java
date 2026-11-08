package br.ufgd.gdcenter.game;

import br.ufgd.gdcenter.dto.outbound.PlayerSummaryDTO;
import br.ufgd.gdcenter.dto.outbound.SnapshotPlayerDTO;
import br.ufgd.gdcenter.map.MapData;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Component
public class PlayerRegistry {

    private final Map<String, PlayerSessionState> playersBySessionId = new LinkedHashMap<>();
    private final Map<String, String> activeNamesLower = new LinkedHashMap<>();
    private int nextSpawnIndex = 0;

    public boolean hasSession(String sessionId) {
        return playersBySessionId.containsKey(sessionId);
    }

    public boolean isNameTaken(String name) {
        return activeNamesLower.containsKey(name.toLowerCase(Locale.ROOT));
    }

    public PlayerSessionState registerPlayer(
            WebSocketSession session,
            String name,
            List<MapData.SpawnPoint> spawns
    ) {
        MapData.SpawnPoint spawn = spawns.get(nextSpawnIndex % spawns.size());
        nextSpawnIndex = (nextSpawnIndex + 1) % spawns.size();

        String playerId = UUID.randomUUID().toString();
        PlayerSessionState newPlayer = new PlayerSessionState(
                playerId,
                name,
                session,
                spawn.x(),
                spawn.y(),
                spawn.z(),
                spawn.yaw()
        );

        playersBySessionId.put(session.getId(), newPlayer);
        activeNamesLower.put(name.toLowerCase(Locale.ROOT), session.getId());
        return newPlayer;
    }

    public PlayerSessionState getBySessionId(String sessionId) {
        return playersBySessionId.get(sessionId);
    }

    public PlayerSessionState removeBySessionId(String sessionId) {
        PlayerSessionState removed = playersBySessionId.remove(sessionId);
        if (removed != null) {
            activeNamesLower.remove(removed.getName().toLowerCase(Locale.ROOT));
        }
        return removed;
    }

    public Collection<PlayerSessionState> getAllPlayers() {
        return playersBySessionId.values();
    }

    public boolean isEmpty() {
        return playersBySessionId.isEmpty();
    }

    public List<PlayerSummaryDTO> buildPlayerSummaries() {
        List<PlayerSummaryDTO> summaries = new ArrayList<>(playersBySessionId.size());
        for (PlayerSessionState player : playersBySessionId.values()) {
            summaries.add(player.toSummaryDTO());
        }
        return summaries;
    }

    public List<SnapshotPlayerDTO> buildSnapshotEntries() {
        List<SnapshotPlayerDTO> entries = new ArrayList<>(playersBySessionId.size());
        for (PlayerSessionState player : playersBySessionId.values()) {
            entries.add(player.toSnapshotDTO());
        }
        return entries;
    }
}
