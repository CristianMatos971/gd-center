package br.ufgd.gdcenter.dto.outbound;

public record ErrorResponseDTO(
        String type,
        String message
) {
    public ErrorResponseDTO(String message) {
        this("error", message);
    }
}
