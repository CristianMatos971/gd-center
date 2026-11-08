package br.ufgd.gdcenter.dto.inbound;

import br.ufgd.gdcenter.movement.MovementSystem;
import tools.jackson.databind.JsonNode;

import java.util.Optional;

public record PlayerInputDTO(
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

    private static final double MAX_PITCH = Math.toRadians(89.0);

    public static Optional<PlayerInputDTO> fromJson(JsonNode root) {
        JsonNode seqNode = root.get("seq");
        JsonNode yawNode = root.get("yaw");
        JsonNode pitchNode = root.get("pitch");

        if (seqNode == null || !seqNode.isNumber()
                || yawNode == null || !yawNode.isNumber()
                || pitchNode == null || !pitchNode.isNumber()) {
            return Optional.empty();
        }

        long seq = seqNode.asLong(-1L);
        double yaw = yawNode.asDouble(Double.NaN);
        double pitch = pitchNode.asDouble(Double.NaN);

        if (seq <= 0 || !Double.isFinite(yaw) || !Double.isFinite(pitch)) {
            return Optional.empty();
        }

        double clampedPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch));

        boolean forward = root.path("forward").asBoolean(false);
        boolean back = root.path("back").asBoolean(false);
        boolean left = root.path("left").asBoolean(false);
        boolean right = root.path("right").asBoolean(false);
        boolean run = root.path("run").asBoolean(false);
        boolean jump = root.path("jump").asBoolean(false);

        return Optional.of(new PlayerInputDTO(
                seq, forward, back, left, right, run, jump, yaw, clampedPitch
        ));
    }

    public MovementSystem.Input toMovementInput() {
        return new MovementSystem.Input(forward, back, left, right, run, jump, yaw, pitch);
    }
}
