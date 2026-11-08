package br.ufgd.gdcenter.dto.outbound;

public record PlayerStateDTO(
        double x,
        double y,
        double z,
        double vy,
        boolean onGround,
        double yaw,
        double pitch
) {}
