package br.ufgd.gdcenter.movement;

import br.ufgd.gdcenter.map.MapData;
import java.util.List;

public final class MovementSystem {

    private static final double EPSILON = 1e-9;

    private MovementSystem() {}

    public record State(double x, double y, double z, double vy, boolean onGround) {}

    public record Input(
            boolean forward,
            boolean back,
            boolean left,
            boolean right,
            boolean run,
            boolean jump,
            double yaw,
            double pitch
    ) {}

    public static State step(
            State state,
            Input input,
            MapData.Physics physics,
            MapData.Ground ground,
            MapData.Bounds bounds,
            List<MapData.MapBox> boxes
    ) {
        double dt = 1.0 / physics.tickRate();

        double x = state.x();
        double y = state.y();
        double z = state.z();
        double vy = state.vy();
        boolean onGround = state.onGround();

        double forwardAxis = (input.forward() ? 1.0 : 0.0) - (input.back() ? 1.0 : 0.0);
        double rightAxis = (input.right() ? 1.0 : 0.0) - (input.left() ? 1.0 : 0.0);

        double sinYaw = Math.sin(input.yaw());
        double cosYaw = Math.cos(input.yaw());

        double forwardX = -sinYaw;
        double forwardZ = -cosYaw;
        double rightX = cosYaw;
        double rightZ = -sinYaw;

        double dirX = forwardAxis * forwardX + rightAxis * rightX;
        double dirZ = forwardAxis * forwardZ + rightAxis * rightZ;
        double len = Math.hypot(dirX, dirZ);
        if (len > 0.0) {
            dirX /= len;
            dirZ /= len;
        }

        double speed = input.run() ? physics.runSpeed() : physics.walkSpeed();
        double vx = dirX * speed;
        double vz = dirZ * speed;

        if (input.jump() && onGround) {
            vy = physics.jumpSpeed();
            onGround = false;
        }

        vy -= physics.gravity() * dt;

        double halfW = physics.player().width() * 0.5;
        double halfD = physics.player().depth() * 0.5;
        double playerH = physics.player().height();

        List<MapData.MapBox> boxList = boxes != null ? boxes : List.of();

        x += vx * dt;
        if (vx != 0.0) {
            for (MapData.MapBox box : boxList) {
                if (overlaps(x, y, z, halfW, playerH, halfD, box)) {
                    double boxMinX = box.x() - box.width() * 0.5;
                    double boxMaxX = box.x() + box.width() * 0.5;
                    if (vx > 0.0) {
                        x = boxMinX - halfW;
                    } else {
                        x = boxMaxX + halfW;
                    }
                }
            }
        }

        z += vz * dt;
        if (vz != 0.0) {
            for (MapData.MapBox box : boxList) {
                if (overlaps(x, y, z, halfW, playerH, halfD, box)) {
                    double boxMinZ = box.z() - box.depth() * 0.5;
                    double boxMaxZ = box.z() + box.depth() * 0.5;
                    if (vz > 0.0) {
                        z = boxMinZ - halfD;
                    } else {
                        z = boxMaxZ + halfD;
                    }
                }
            }
        }

        onGround = false;
        y += vy * dt;
        for (MapData.MapBox box : boxList) {
            if (overlaps(x, y, z, halfW, playerH, halfD, box)) {
                double boxMinY = box.y() - box.height() * 0.5;
                double boxMaxY = box.y() + box.height() * 0.5;
                if (vy <= 0.0) {
                    y = boxMaxY;
                    vy = 0.0;
                    onGround = true;
                } else {
                    y = boxMinY - playerH;
                    vy = 0.0;
                }
            }
        }

        if (y <= ground.y()) {
            y = ground.y();
            vy = 0.0;
            onGround = true;
        }

        double minX = bounds.minX() + halfW;
        double maxX = bounds.maxX() - halfW;
        double minZ = bounds.minZ() + halfD;
        double maxZ = bounds.maxZ() - halfD;

        if (x < minX) x = minX;
        if (x > maxX) x = maxX;
        if (z < minZ) z = minZ;
        if (z > maxZ) z = maxZ;

        return new State(x, y, z, vy, onGround);
    }

    private static boolean overlaps(
            double px,
            double py,
            double pz,
            double halfW,
            double playerH,
            double halfD,
            MapData.MapBox box
    ) {
        double pMinX = px - halfW;
        double pMaxX = px + halfW;
        double pMinY = py;
        double pMaxY = py + playerH;
        double pMinZ = pz - halfD;
        double pMaxZ = pz + halfD;

        double bMinX = box.x() - box.width() * 0.5;
        double bMaxX = box.x() + box.width() * 0.5;
        double bMinY = box.y() - box.height() * 0.5;
        double bMaxY = box.y() + box.height() * 0.5;
        double bMinZ = box.z() - box.depth() * 0.5;
        double bMaxZ = box.z() + box.depth() * 0.5;

        return (pMaxX > bMinX + EPSILON && pMinX < bMaxX - EPSILON)
                && (pMaxY > bMinY + EPSILON && pMinY < bMaxY - EPSILON)
                && (pMaxZ > bMinZ + EPSILON && pMinZ < bMaxZ - EPSILON);
    }
}
