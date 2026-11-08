package br.ufgd.gdcenter.dto.outbound;

import br.ufgd.gdcenter.structure.BuildRejectionCode;

public record BuildRejectedResponseDTO(
        String type,
        String code
) {
    public BuildRejectedResponseDTO(BuildRejectionCode code) {
        this("build_rejected", code.name());
    }
}
