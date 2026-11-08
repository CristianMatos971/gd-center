package br.ufgd.gdcenter.dto.outbound;

import br.ufgd.gdcenter.structure.Structure;

import java.util.List;

public record StructuresUpdateResponseDTO(
        String type,
        List<Structure> added,
        List<Structure> updated,
        List<String> removedIds
) {
    public StructuresUpdateResponseDTO(
            List<Structure> added,
            List<Structure> updated,
            List<String> removedIds
    ) {
        this("structures_update", added, updated, removedIds);
    }
}
