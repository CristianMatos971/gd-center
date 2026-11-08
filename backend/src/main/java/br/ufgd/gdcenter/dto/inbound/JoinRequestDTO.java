package br.ufgd.gdcenter.dto.inbound;

import tools.jackson.databind.JsonNode;

import java.util.Optional;

public record JoinRequestDTO(String name) {

    public static final int MIN_NAME_LENGTH = 1;
    public static final int MAX_NAME_LENGTH = 16;

    public static JoinRequestDTO fromJson(JsonNode root) {
        String rawName = root.path("name").asString("");
        String trimmed = rawName == null ? "" : rawName.trim();
        return new JoinRequestDTO(trimmed);
    }

    public Optional<String> validate() {
        if (name.length() < MIN_NAME_LENGTH || name.length() > MAX_NAME_LENGTH) {
            return Optional.of("O nome deve ter entre 1 e 16 caracteres.");
        }
        return Optional.empty();
    }
}
