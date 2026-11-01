package br.ufgd.gdcenter.game;

import java.util.List;

/**
 * Outbound and inbound WebSocket protocol records.
 * Every outbound record includes a "type" field.
 */
public final class ProtocolMessages {

    private ProtocolMessages() {}

    public record PlayerStatePayload(
            double x,
            double y,
            double z,
            double vy,
            boolean onGround,
            double yaw,
            double pitch
    ) {}

    public record PlayerSummaryPayload(
            String id,
            String name,
            PlayerStatePayload state
    ) {}

    public record WelcomeMessage(
            String type,
            String playerId,
            int tickRate,
            int snapshotRate,
            PlayerStatePayload self,
            List<PlayerSummaryPayload> players
    ) {
        public WelcomeMessage(
                String playerId,
                int tickRate,
                int snapshotRate,
                PlayerStatePayload self,
                List<PlayerSummaryPayload> players
        ) {
            this("welcome", playerId, tickRate, snapshotRate, self, players);
        }
    }

    public record PlayerJoinedMessage(
            String type,
            String id,
            String name,
            PlayerStatePayload state
    ) {
        public PlayerJoinedMessage(String id, String name, PlayerStatePayload state) {
            this("player_joined", id, name, state);
        }
    }

    public record PlayerLeftMessage(
            String type,
            String id
    ) {
        public PlayerLeftMessage(String id) {
            this("player_left", id);
        }
    }

    public record SnapshotPlayerEntry(
            String id,
            double x,
            double y,
            double z,
            double vy,
            boolean onGround,
            double yaw,
            double pitch,
            long seq
    ) {}

    public record SnapshotMessage(
            String type,
            long tick,
            List<SnapshotPlayerEntry> players
    ) {
        public SnapshotMessage(long tick, List<SnapshotPlayerEntry> players) {
            this("snapshot", tick, players);
        }
    }

    public record PongMessage(
            String type,
            double t
    ) {
        public PongMessage(double t) {
            this("pong", t);
        }
    }

    public record ErrorMessage(
            String type,
            String message
    ) {
        public ErrorMessage(String message) {
            this("error", message);
        }
    }
}
