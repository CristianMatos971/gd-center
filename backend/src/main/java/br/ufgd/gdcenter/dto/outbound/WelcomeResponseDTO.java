package br.ufgd.gdcenter.dto.outbound;

import br.ufgd.gdcenter.structure.Structure;

import java.util.List;

public record WelcomeResponseDTO(
        String type,
        String playerId,
        int tickRate,
        int snapshotRate,
        PlayerStateDTO self,
        List<PlayerSummaryDTO> players,
        List<Structure> structures
) {
    public WelcomeResponseDTO(
            String playerId,
            int tickRate,
            int snapshotRate,
            PlayerStateDTO self,
            List<PlayerSummaryDTO> players,
            List<Structure> structures
    ) {
        this("welcome", playerId, tickRate, snapshotRate, self, players, structures);
    }
}
