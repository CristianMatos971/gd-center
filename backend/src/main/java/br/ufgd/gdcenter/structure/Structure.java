package br.ufgd.gdcenter.structure;

import br.ufgd.gdcenter.movement.ColliderBox;

public record Structure(
        String id,
        String kind,
        double x,
        double y,
        double z,
        double width,
        double height,
        double depth,
        String color
) {
    public ColliderBox toColliderBox() {
        return new ColliderBox(x, y, z, width, height, depth);
    }
}
