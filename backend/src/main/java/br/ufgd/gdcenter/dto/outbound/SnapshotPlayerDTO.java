package br.ufgd.gdcenter.dto.outbound;

public record SnapshotPlayerDTO(
        String id,
        double x,
        double y,
        double z,
        double vy,
        boolean onGround,
        double yaw,
        double pitch,
        long seq
) {}
