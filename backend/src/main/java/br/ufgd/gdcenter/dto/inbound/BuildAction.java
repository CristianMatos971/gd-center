package br.ufgd.gdcenter.dto.inbound;

import tools.jackson.databind.JsonNode;

public sealed interface BuildAction permits
        BuildAction.Place,
        BuildAction.Update,
        BuildAction.Remove,
        BuildAction.Invalid {

    record Place(BuildPlaceRequestDTO request) implements BuildAction {}

    record Update(BuildUpdateRequestDTO request) implements BuildAction {}

    record Remove(BuildRemoveRequestDTO request) implements BuildAction {}

    record Invalid(String reason) implements BuildAction {}

    static BuildAction fromJson(String type, JsonNode root) {
        return switch (type) {
            case "build_place" -> BuildPlaceRequestDTO.fromJson(root)
                    .<BuildAction>map(Place::new)
                    .orElseGet(() -> new Invalid("Malformed build_place payload"));
            case "build_update" -> BuildUpdateRequestDTO.fromJson(root)
                    .<BuildAction>map(Update::new)
                    .orElseGet(() -> new Invalid("Malformed build_update payload"));
            case "build_remove" -> BuildRemoveRequestDTO.fromJson(root)
                    .<BuildAction>map(Remove::new)
                    .orElseGet(() -> new Invalid("Malformed build_remove payload"));
            default -> new Invalid("Unknown build command: " + type);
        };
    }
}
