package br.ufgd.gdcenter.dto.inbound;

import tools.jackson.databind.JsonNode;

import java.util.Optional;

public record PingRequestDTO(double t) {

    public static Optional<PingRequestDTO> fromJson(JsonNode root) {
        JsonNode tNode = root.get("t");
        if (tNode == null || !tNode.isNumber()) {
            return Optional.empty();
        }
        double t = tNode.asDouble(Double.NaN);
        if (!Double.isFinite(t)) {
            return Optional.empty();
        }
        return Optional.of(new PingRequestDTO(t));
    }
}
