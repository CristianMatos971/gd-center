package br.ufgd.gdcenter.map;

import java.util.Map;

public record BuildConfig(
        double grid,
        double minSize,
        double maxSize,
        int maxStructures,
        double maxY,
        Map<String, KindSpec> kinds
) {
    public record KindSpec(
            double width,
            double height,
            double depth,
            String color
    ) {}

    public void validate() {
        if (grid <= 0 || minSize <= 0 || maxSize < minSize || maxStructures <= 0 || maxY <= 0) {
            throw new IllegalStateException("Invalid build configuration limits");
        }
        if (kinds == null || kinds.isEmpty()) {
            throw new IllegalStateException("Build configuration requires at least one kind");
        }
        for (Map.Entry<String, KindSpec> entry : kinds.entrySet()) {
            KindSpec spec = entry.getValue();
            if (spec == null
                    || spec.width() < minSize || spec.width() > maxSize
                    || spec.height() < minSize || spec.height() > maxSize
                    || spec.depth() < minSize || spec.depth() > maxSize
                    || spec.color() == null || !spec.color().matches("^#[0-9a-fA-F]{6}$")) {
                throw new IllegalStateException("Invalid build kind specification for: " + entry.getKey());
            }
        }
    }
}
