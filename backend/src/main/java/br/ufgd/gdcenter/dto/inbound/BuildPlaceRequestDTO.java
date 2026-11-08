package br.ufgd.gdcenter.dto.inbound;

import tools.jackson.databind.JsonNode;

import java.util.Optional;

public record BuildPlaceRequestDTO(
        String kind,
        double x,
        double y,
        double z,
        double width,
        double height,
        double depth,
        String color
) {
    public static Optional<BuildPlaceRequestDTO> fromJson(JsonNode root) {
        JsonNode kindNode = root.get("kind");
        JsonNode xNode = root.get("x");
        JsonNode yNode = root.get("y");
        JsonNode zNode = root.get("z");
        JsonNode widthNode = root.get("width");
        JsonNode heightNode = root.get("height");
        JsonNode depthNode = root.get("depth");
        JsonNode colorNode = root.get("color");

        if (kindNode == null || !kindNode.isString()
                || xNode == null || !xNode.isNumber()
                || yNode == null || !yNode.isNumber()
                || zNode == null || !zNode.isNumber()
                || widthNode == null || !widthNode.isNumber()
                || heightNode == null || !heightNode.isNumber()
                || depthNode == null || !depthNode.isNumber()
                || colorNode == null || !colorNode.isString()) {
            return Optional.empty();
        }

        return Optional.of(new BuildPlaceRequestDTO(
                kindNode.asString(""),
                xNode.asDouble(Double.NaN),
                yNode.asDouble(Double.NaN),
                zNode.asDouble(Double.NaN),
                widthNode.asDouble(Double.NaN),
                heightNode.asDouble(Double.NaN),
                depthNode.asDouble(Double.NaN),
                colorNode.asString("")
        ));
    }
}
