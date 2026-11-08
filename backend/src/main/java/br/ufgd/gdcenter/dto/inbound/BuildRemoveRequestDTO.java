package br.ufgd.gdcenter.dto.inbound;

import tools.jackson.databind.JsonNode;

import java.util.Optional;

public record BuildRemoveRequestDTO(String id) {
    public static Optional<BuildRemoveRequestDTO> fromJson(JsonNode root) {
        JsonNode idNode = root.get("id");
        if (idNode == null || !idNode.isString()) {
            return Optional.empty();
        }
        return Optional.of(new BuildRemoveRequestDTO(idNode.asString("")));
    }
}
