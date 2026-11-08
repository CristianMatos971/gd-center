package br.ufgd.gdcenter.dto.outbound;

import java.util.List;

public record WelcomeResponseDTO(
        String type,
        String playerId,
        int tickRate,
        int snapshotRate,
        PlayerStateDTO self,
        List<PlayerSummaryDTO> players
) {
    public WelcomeResponseDTO(
            String playerId,
            int tickRate,
            int snapshotRate,
            PlayerStateDTO self,
            List<PlayerSummaryDTO> players
    ) {
        this("welcome", playerId, tickRate, snapshotRate, self, players);
    }
}
