package br.ufgd.gdcenter.dto.outbound;

import java.util.List;

public record SnapshotResponseDTO(
        String type,
        long tick,
        List<SnapshotPlayerDTO> players
) {
    public SnapshotResponseDTO(long tick, List<SnapshotPlayerDTO> players) {
        this("snapshot", tick, players);
    }
}
