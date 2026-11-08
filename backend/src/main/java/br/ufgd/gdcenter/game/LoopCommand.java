package br.ufgd.gdcenter.game;

import br.ufgd.gdcenter.dto.inbound.BuildAction;
import br.ufgd.gdcenter.dto.inbound.JoinRequestDTO;
import br.ufgd.gdcenter.dto.inbound.PlayerInputDTO;
import org.springframework.web.socket.WebSocketSession;

public sealed interface LoopCommand permits
        LoopCommand.JoinCommand,
        LoopCommand.InputCommand,
        LoopCommand.BuildCommand,
        LoopCommand.LeaveCommand {

    record JoinCommand(WebSocketSession session, JoinRequestDTO request) implements LoopCommand {}

    record InputCommand(String sessionId, PlayerInputDTO input) implements LoopCommand {}

    record BuildCommand(String sessionId, BuildAction action) implements LoopCommand {}

    record LeaveCommand(String sessionId) implements LoopCommand {}
}
