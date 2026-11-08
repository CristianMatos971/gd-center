package br.ufgd.gdcenter.structure;

import br.ufgd.gdcenter.dto.outbound.StructuresUpdateResponseDTO;
import br.ufgd.gdcenter.movement.ColliderBox;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

@Component
public class StructureRegistry {

    private final StructurePersistenceService persistenceService;
    private final Map<String, Structure> structuresById = new LinkedHashMap<>();
    private final Set<String> addedIdsThisTick = new LinkedHashSet<>();
    private final Set<String> updatedIdsThisTick = new LinkedHashSet<>();
    private final Set<String> removedIdsThisTick = new LinkedHashSet<>();

    private List<ColliderBox> cachedColliders = List.of();
    private List<Structure> cachedStructures = List.of();

    public StructureRegistry(StructurePersistenceService persistenceService) {
        this.persistenceService = persistenceService;
        List<Structure> initial = persistenceService.loadInitialStructures();
        for (Structure s : initial) {
            structuresById.put(s.id(), s);
        }
        rebuildCaches();
    }

    public int size() {
        return structuresById.size();
    }

    public boolean contains(String id) {
        return structuresById.containsKey(id);
    }

    public Structure getById(String id) {
        return structuresById.get(id);
    }

    public List<Structure> getAllStructures() {
        return cachedStructures;
    }

    public List<ColliderBox> getColliderBoxes() {
        return cachedColliders;
    }

    public void add(Structure structure) {
        structuresById.put(structure.id(), structure);
        removedIdsThisTick.remove(structure.id());
        addedIdsThisTick.add(structure.id());
        rebuildCaches();
    }

    public void update(Structure structure) {
        structuresById.put(structure.id(), structure);
        if (!addedIdsThisTick.contains(structure.id())) {
            updatedIdsThisTick.add(structure.id());
        }
        rebuildCaches();
    }

    public void remove(String id) {
        Structure removed = structuresById.remove(id);
        if (removed == null) {
            return;
        }
        updatedIdsThisTick.remove(id);
        if (!addedIdsThisTick.remove(id)) {
            removedIdsThisTick.add(id);
        }
        rebuildCaches();
    }

    public Optional<StructuresUpdateResponseDTO> drainTickChanges() {
        if (addedIdsThisTick.isEmpty() && updatedIdsThisTick.isEmpty() && removedIdsThisTick.isEmpty()) {
            return Optional.empty();
        }

        List<Structure> added = new ArrayList<>(addedIdsThisTick.size());
        for (String id : addedIdsThisTick) {
            Structure s = structuresById.get(id);
            if (s != null) {
                added.add(s);
            }
        }

        List<Structure> updated = new ArrayList<>(updatedIdsThisTick.size());
        for (String id : updatedIdsThisTick) {
            Structure s = structuresById.get(id);
            if (s != null) {
                updated.add(s);
            }
        }

        List<String> removedIds = List.copyOf(removedIdsThisTick);

        addedIdsThisTick.clear();
        updatedIdsThisTick.clear();
        removedIdsThisTick.clear();

        persistenceService.markDirty(cachedStructures);

        return Optional.of(new StructuresUpdateResponseDTO(added, updated, removedIds));
    }

    public void flushToDisk() {
        if (!addedIdsThisTick.isEmpty() || !updatedIdsThisTick.isEmpty() || !removedIdsThisTick.isEmpty()) {
            addedIdsThisTick.clear();
            updatedIdsThisTick.clear();
            removedIdsThisTick.clear();
            persistenceService.markDirty(cachedStructures);
        }
        persistenceService.flushIfDirtySafely();
    }

    private void rebuildCaches() {
        List<Structure> structuresList = new ArrayList<>(structuresById.size());
        List<ColliderBox> collidersList = new ArrayList<>(structuresById.size());
        for (Structure s : structuresById.values()) {
            structuresList.add(s);
            collidersList.add(s.toColliderBox());
        }
        this.cachedStructures = List.copyOf(structuresList);
        this.cachedColliders = List.copyOf(collidersList);
    }
}
