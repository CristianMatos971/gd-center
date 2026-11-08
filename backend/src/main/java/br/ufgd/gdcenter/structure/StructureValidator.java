package br.ufgd.gdcenter.structure;

import br.ufgd.gdcenter.dto.inbound.BuildPlaceRequestDTO;
import br.ufgd.gdcenter.dto.inbound.BuildRemoveRequestDTO;
import br.ufgd.gdcenter.dto.inbound.BuildUpdateRequestDTO;
import br.ufgd.gdcenter.game.PlayerSessionState;
import br.ufgd.gdcenter.map.BuildConfig;
import br.ufgd.gdcenter.map.MapData;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Optional;
import java.util.regex.Pattern;

@Component
public class StructureValidator {

    private static final double EPSILON = 1e-9;
    private static final double PLAYER_CLEARANCE_METERS = 0.1;
    private static final double MIN_BOTTOM_Y = 0.0;
    private static final Pattern HEX_COLOR_PATTERN = Pattern.compile("^#[0-9a-fA-F]{6}$");

    public Optional<BuildRejectionCode> validatePlace(
            BuildPlaceRequestDTO req,
            MapData mapData,
            int currentStructureCount,
            Collection<PlayerSessionState> connectedPlayers
    ) {
        BuildConfig build = mapData.build();
        if (req == null || req.kind() == null || !build.kinds().containsKey(req.kind())) {
            return Optional.of(BuildRejectionCode.INVALID);
        }
        if (!hasValidTransformAndStyle(
                req.x(), req.y(), req.z(),
                req.width(), req.height(), req.depth(),
                req.color(), build
        )) {
            return Optional.of(BuildRejectionCode.INVALID);
        }
        if (currentStructureCount >= build.maxStructures()) {
            return Optional.of(BuildRejectionCode.TOO_MANY);
        }
        if (!isWithinBounds(
                req.x(), req.y(), req.z(),
                req.width(), req.height(), req.depth(),
                mapData.bounds(), build.maxY()
        )) {
            return Optional.of(BuildRejectionCode.OUT_OF_BOUNDS);
        }
        if (overlapsAnyPlayer(
                req.x(), req.y(), req.z(),
                req.width(), req.height(), req.depth(),
                mapData.physics().player(), connectedPlayers
        )) {
            return Optional.of(BuildRejectionCode.BLOCKED_BY_PLAYER);
        }
        return Optional.empty();
    }

    public Optional<BuildRejectionCode> validateUpdate(
            BuildUpdateRequestDTO req,
             boolean exists,
            MapData mapData,
            Collection<PlayerSessionState> connectedPlayers
    ) {
        BuildConfig build = mapData.build();
        if (req == null || req.id() == null || req.id().isBlank()) {
            return Optional.of(BuildRejectionCode.INVALID);
        }
        if (!hasValidTransformAndStyle(
                req.x(), req.y(), req.z(),
                req.width(), req.height(), req.depth(),
                req.color(), build
        )) {
            return Optional.of(BuildRejectionCode.INVALID);
        }
        if (!exists) {
            return Optional.of(BuildRejectionCode.NOT_FOUND);
        }
        if (!isWithinBounds(
                req.x(), req.y(), req.z(),
                req.width(), req.height(), req.depth(),
                mapData.bounds(), build.maxY()
        )) {
            return Optional.of(BuildRejectionCode.OUT_OF_BOUNDS);
        }
        if (overlapsAnyPlayer(
                req.x(), req.y(), req.z(),
                req.width(), req.height(), req.depth(),
                mapData.physics().player(), connectedPlayers
        )) {
            return Optional.of(BuildRejectionCode.BLOCKED_BY_PLAYER);
        }
        return Optional.empty();
    }

    public Optional<BuildRejectionCode> validateRemove(BuildRemoveRequestDTO req, boolean exists) {
        if (req == null || req.id() == null || req.id().isBlank()) {
            return Optional.of(BuildRejectionCode.INVALID);
        }
        if (!exists) {
            return Optional.of(BuildRejectionCode.NOT_FOUND);
        }
        return Optional.empty();
    }

    private boolean hasValidTransformAndStyle(
            double x,
            double y,
            double z,
            double width,
            double height,
            double depth,
            String color,
            BuildConfig build
    ) {
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)
                || !Double.isFinite(width) || !Double.isFinite(height) || !Double.isFinite(depth)) {
            return false;
        }
        double min = build.minSize() - EPSILON;
        double max = build.maxSize() + EPSILON;
        if (width < min || width > max || height < min || height > max || depth < min || depth > max) {
            return false;
        }
        return color != null && HEX_COLOR_PATTERN.matcher(color).matches();
    }

    private boolean isWithinBounds(
            double x,
            double y,
            double z,
            double width,
            double height,
            double depth,
            MapData.Bounds bounds,
            double maxY
    ) {
        double minX = x - width * 0.5;
        double maxX = x + width * 0.5;
        double minY = y - height * 0.5;
        double maxBoxY = y + height * 0.5;
        double minZ = z - depth * 0.5;
        double maxZ = z + depth * 0.5;

        return minX >= bounds.minX() - EPSILON
                && maxX <= bounds.maxX() + EPSILON
                && minZ >= bounds.minZ() - EPSILON
                && maxZ <= bounds.maxZ() + EPSILON
                && minY >= MIN_BOTTOM_Y - EPSILON
                && maxBoxY <= maxY + EPSILON;
    }

    private boolean overlapsAnyPlayer(
            double x,
            double y,
            double z,
            double width,
            double height,
            double depth,
            MapData.PlayerDimensions playerDims,
            Collection<PlayerSessionState> players
    ) {
        double sMinX = x - width * 0.5 - PLAYER_CLEARANCE_METERS;
        double sMaxX = x + width * 0.5 + PLAYER_CLEARANCE_METERS;
        double sMinY = y - height * 0.5 - PLAYER_CLEARANCE_METERS;
        double sMaxY = y + height * 0.5 + PLAYER_CLEARANCE_METERS;
        double sMinZ = z - depth * 0.5 - PLAYER_CLEARANCE_METERS;
        double sMaxZ = z + depth * 0.5 + PLAYER_CLEARANCE_METERS;

        double pHalfW = playerDims.width() * 0.5;
        double pHalfD = playerDims.depth() * 0.5;
        double pHeight = playerDims.height();

        for (PlayerSessionState player : players) {
            MovementSystemStateView p = extractPosition(player);
            double pMinX = p.x - pHalfW;
            double pMaxX = p.x + pHalfW;
            double pMinY = p.y;
            double pMaxY = p.y + pHeight;
            double pMinZ = p.z - pHalfD;
            double pMaxZ = p.z + pHalfD;

            boolean overlaps = (sMaxX > pMinX + EPSILON && sMinX < pMaxX - EPSILON)
                    && (sMaxY > pMinY + EPSILON && sMinY < pMaxY - EPSILON)
                    && (sMaxZ > pMinZ + EPSILON && sMinZ < pMaxZ - EPSILON);
            if (overlaps) {
                return true;
            }
        }
        return false;
    }

    private record MovementSystemStateView(double x, double y, double z) {}

    private MovementSystemStateView extractPosition(PlayerSessionState player) {
        var state = player.toMovementState();
        return new MovementSystemStateView(state.x(), state.y(), state.z());
    }
}
