package br.ufgd.gdcenter.dto.outbound;

public record PlayerLeftResponseDTO(
        String type,
        String id
) {
    public PlayerLeftResponseDTO(String id) {
        this("player_left", id);
    }
}
