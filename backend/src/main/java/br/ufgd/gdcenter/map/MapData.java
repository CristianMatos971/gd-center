package br.ufgd.gdcenter.map;

import java.util.List;

public record MapData(
        int version,
        String name,
        Sky sky,
        Ground ground,
        Bounds bounds,
        List<SpawnPoint> spawnPoints,
        List<MapBox> boxes,
        Physics physics
) {
    public record Sky(String color) {}

    public record Ground(double y, String color) {}

    public record Bounds(double minX, double maxX, double minZ, double maxZ) {}

    public record SpawnPoint(double x, double y, double z, double yaw) {}

    public record MapBox(double x, double y, double z, double width, double height, double depth, String color) {}

    public record Physics(
            int tickRate,
            double gravity,
            double walkSpeed,
            double runSpeed,
            double jumpSpeed,
            PlayerDimensions player
    ) {}

    public record PlayerDimensions(double width, double height, double depth, double eyeHeight) {}

    public void validate() {
        if (version != 1) {
            throw new IllegalStateException("Unsupported map version: " + version);
        }
        if (name == null || name.isBlank()) {
            throw new IllegalStateException("Map name must not be blank");
        }
        if (sky == null || sky.color() == null || sky.color().isBlank()) {
            throw new IllegalStateException("Map sky color is required");
        }
        if (ground == null || ground.color() == null || ground.color().isBlank()) {
            throw new IllegalStateException("Map ground configuration is required");
        }
        if (bounds == null || bounds.minX() >= bounds.maxX() || bounds.minZ() >= bounds.maxZ()) {
            throw new IllegalStateException("Invalid map bounds");
        }
        if (spawnPoints == null || spawnPoints.isEmpty()) {
            throw new IllegalStateException("At least one spawn point is required");
        }
        if (boxes == null) {
            throw new IllegalStateException("Boxes list must not be null");
        }
        for (MapBox box : boxes) {
            if (box.width() <= 0 || box.height() <= 0 || box.depth() <= 0) {
                throw new IllegalStateException("Map box dimensions must be positive");
            }
        }
        if (physics == null || physics.tickRate() <= 0 || physics.gravity() <= 0
                || physics.walkSpeed() <= 0 || physics.runSpeed() <= 0 || physics.jumpSpeed() <= 0) {
            throw new IllegalStateException("Invalid physics configuration");
        }
        if (physics.player() == null || physics.player().width() <= 0
                || physics.player().height() <= 0 || physics.player().depth() <= 0
                || physics.player().eyeHeight() <= 0) {
            throw new IllegalStateException("Invalid player dimensions");
        }
    }
}
