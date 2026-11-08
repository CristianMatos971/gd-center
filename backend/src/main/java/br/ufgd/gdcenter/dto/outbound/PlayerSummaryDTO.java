package br.ufgd.gdcenter.dto.outbound;

public record PlayerSummaryDTO(
        String id,
        String name,
        PlayerStateDTO state
) {}
