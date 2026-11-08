package br.ufgd.gdcenter.dto.outbound;

public record PongResponseDTO(
        String type,
        double t
) {
    public PongResponseDTO(double t) {
        this("pong", t);
    }
}
