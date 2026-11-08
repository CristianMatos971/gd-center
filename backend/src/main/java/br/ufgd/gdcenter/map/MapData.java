package br.ufgd.gdcenter.map;

import java.util.List;

public record MapData(
        int version,
        String name,
        Sky sky,
        Ground ground,
        Bounds bounds,
        List<SpawnPoint> spawnPoints,
        Physics physics,
        BuildConfig build
) {
    public record Sky(String color) {}

    public record Ground(double y, String color) {}

    public record Bounds(double minX, double maxX, double minZ, double maxZ) {}

    public record SpawnPoint(double x, double y, double z, double yaw) {}

    public record Physics(
            int tickRate,
            double gravity,
            double walkSpeed,
            double runSpeed,
            double jumpSpeed,
            PlayerDimensions player
    ) {
        public void validate() {
            if (tickRate <= 0 || gravity <= 0 || walkSpeed <= 0 || runSpeed <= 0 || jumpSpeed <= 0) {
                throw new IllegalStateException("Invalid physics configuration");
            }
            if (player == null || player.width() <= 0 || player.height() <= 0
                    || player.depth() <= 0 || player.eyeHeight() <= 0) {
                throw new IllegalStateException("Invalid player dimensions");
            }
        }
    }

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
        if (physics == null) {
            throw new IllegalStateException("Physics configuration is required");
        }
        physics.validate();
        if (build == null) {
            throw new IllegalStateException("Build configuration is required");
        }
        build.validate();
    }
}
