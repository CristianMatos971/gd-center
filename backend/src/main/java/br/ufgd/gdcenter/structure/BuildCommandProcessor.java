package br.ufgd.gdcenter.structure;

import br.ufgd.gdcenter.dto.inbound.BuildAction;
import br.ufgd.gdcenter.dto.inbound.BuildPlaceRequestDTO;
import br.ufgd.gdcenter.dto.inbound.BuildRemoveRequestDTO;
import br.ufgd.gdcenter.dto.inbound.BuildUpdateRequestDTO;
import br.ufgd.gdcenter.game.PlayerRegistry;
import br.ufgd.gdcenter.game.PlayerSessionState;
import br.ufgd.gdcenter.game.WebSocketBroadcaster;
import br.ufgd.gdcenter.map.MapData;
import br.ufgd.gdcenter.map.MapService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

@Component
public class BuildCommandProcessor {

    private static final Logger log = LoggerFactory.getLogger(BuildCommandProcessor.class);
    public static final int MAX_BUILD_COMMANDS_PER_TICK = 8;

    private final MapService mapService;
    private final PlayerRegistry playerRegistry;
    private final StructureRegistry structureRegistry;
    private final StructureValidator validator;
    private final WebSocketBroadcaster broadcaster;

    public BuildCommandProcessor(
            MapService mapService,
            PlayerRegistry playerRegistry,
            StructureRegistry structureRegistry,
            StructureValidator validator,
            WebSocketBroadcaster broadcaster
    ) {
        this.mapService = mapService;
        this.playerRegistry = playerRegistry;
        this.structureRegistry = structureRegistry;
        this.validator = validator;
        this.broadcaster = broadcaster;
    }

    public void processAllPlayersBuildQueues(long nowNanos) {
        MapData mapData = mapService.getMapData();
        for (PlayerSessionState player : playerRegistry.getAllPlayers()) {
            for (int i = 0; i < MAX_BUILD_COMMANDS_PER_TICK; i++) {
                BuildAction action = player.pollBuildAction();
                if (action == null) {
                    break;
                }
                processSingleAction(player, action, mapData, nowNanos);
            }
        }

        structureRegistry.drainTickChanges().ifPresent(updateDto ->
                broadcaster.broadcastStructuresUpdate(updateDto, playerRegistry.getAllPlayers())
        );
    }

    private void processSingleAction(
            PlayerSessionState player,
            BuildAction action,
            MapData mapData,
            long nowNanos
    ) {
        if (!player.tryConsumeBuildRateLimit(nowNanos)) {
            broadcaster.sendBuildRejected(player.getSession(), BuildRejectionCode.RATE_LIMITED);
            return;
        }

        switch (action) {
            case BuildAction.Invalid invalid -> {
                log.debug("Rejected invalid build command from {}: {}", player.getName(), invalid.reason());
                broadcaster.sendBuildRejected(player.getSession(), BuildRejectionCode.INVALID);
            }
            case BuildAction.Place place -> handlePlace(player, place.request(), mapData);
            case BuildAction.Update update -> handleUpdate(player, update.request(), mapData);
            case BuildAction.Remove remove -> handleRemove(player, remove.request());
        }
    }

    private void handlePlace(PlayerSessionState player, BuildPlaceRequestDTO req, MapData mapData) {
        Optional<BuildRejectionCode> error = validator.validatePlace(
                req,
                mapData,
                structureRegistry.size(),
                playerRegistry.getAllPlayers()
        );
        if (error.isPresent()) {
            broadcaster.sendBuildRejected(player.getSession(), error.get());
            return;
        }

        Structure created = new Structure(
                UUID.randomUUID().toString(),
                req.kind(),
                req.x(),
                req.y(),
                req.z(),
                req.width(),
                req.height(),
                req.depth(),
                req.color().toLowerCase()
        );
        structureRegistry.add(created);
    }

    private void handleUpdate(PlayerSessionState player, BuildUpdateRequestDTO req, MapData mapData) {
        Structure existing = req != null && req.id() != null
                ? structureRegistry.getById(req.id())
                : null;

        Optional<BuildRejectionCode> error = validator.validateUpdate(
                req,
                existing != null,
                mapData,
                playerRegistry.getAllPlayers()
        );
        if (error.isPresent()) {
            broadcaster.sendBuildRejected(player.getSession(), error.get());
            return;
        }

        Structure updated = new Structure(
                existing.id(),
                existing.kind(),
                req.x(),
                req.y(),
                req.z(),
                req.width(),
                req.height(),
                req.depth(),
                req.color().toLowerCase()
        );
        structureRegistry.update(updated);
    }

    private void handleRemove(PlayerSessionState player, BuildRemoveRequestDTO req) {
        boolean exists = req != null && req.id() != null && structureRegistry.contains(req.id());
        Optional<BuildRejectionCode> error = validator.validateRemove(req, exists);
        if (error.isPresent()) {
            broadcaster.sendBuildRejected(player.getSession(), error.get());
            return;
        }

        structureRegistry.remove(req.id());
    }
}
