package br.ufgd.gdcenter.dto.outbound;

public record PlayerJoinedResponseDTO(
        String type,
        String id,
        String name,
        PlayerStateDTO state
) {
    public PlayerJoinedResponseDTO(String id, String name, PlayerStateDTO state) {
        this("player_joined", id, name, state);
    }
}
