package br.ufgd.gdcenter.structure;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

@Repository
public class JsonFileStructureRepository implements StructureRepository {

    private static final Logger log = LoggerFactory.getLogger(JsonFileStructureRepository.class);
    private static final int SUPPORTED_VERSION = 1;
    private static final Pattern HEX_COLOR_PATTERN = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Set<String> VALID_KINDS = Set.of("wall", "floor", "block");

    public record StructuresFilePayload(int version, List<Structure> structures) {}

    private final Path filePath;
    private final ObjectMapper objectMapper;

    public JsonFileStructureRepository(
            @Value("${gdcenter.structures.file:data/structures.json}") String configuredPath,
            ObjectMapper objectMapper
    ) {
        this.filePath = Paths.get(configuredPath).toAbsolutePath().normalize();
        this.objectMapper = objectMapper;
    }

    @Override
    public List<Structure> loadAll() {
        if (!Files.exists(filePath)) {
            log.info("Structures file not found at {}; creating empty file", filePath);
            saveAll(List.of());
            return List.of();
        }

        final StructuresFilePayload payload;
        try {
            byte[] bytes = Files.readAllBytes(filePath);
            payload = objectMapper.readValue(bytes, StructuresFilePayload.class);
        } catch ( Exception e) {
            throw new IllegalStateException("Failed to parse structures file at " + filePath, e);
        }

        validatePayload(payload);
        log.info("Loaded {} structures from {}", payload.structures().size(), filePath);
        return List.copyOf(payload.structures());
    }

    @Override
    public void saveAll(List<Structure> structures) {
        Path parentDir = filePath.getParent();
        Path tempFile = null;
        try {
            if (parentDir != null) {
                Files.createDirectories(parentDir);
            }
            Path dirForTemp = parentDir != null ? parentDir : Paths.get(".").toAbsolutePath().normalize();
            tempFile = Files.createTempFile(dirForTemp, "structures-", ".tmp");

            StructuresFilePayload payload = new StructuresFilePayload(SUPPORTED_VERSION, structures);
            byte[] serialized = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(payload);
            Files.write(tempFile, serialized);

            try {
                Files.move(tempFile, filePath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tempFile, filePath, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            if (tempFile != null) {
                try {
                    Files.deleteIfExists(tempFile);
                } catch (IOException ignored) {
                }
            }
            throw new IllegalStateException("Failed to save structures file at " + filePath, e);
        }
    }

    private void validatePayload(StructuresFilePayload payload) {
        if (payload == null) {
            throw new IllegalStateException("Structures file is null at " + filePath);
        }
        if (payload.version() != SUPPORTED_VERSION) {
            throw new IllegalStateException("Unsupported structures file version: " + payload.version());
        }
        if (payload.structures() == null) {
            throw new IllegalStateException("Structures list is missing in " + filePath);
        }

        Set<String> seenIds = new HashSet<>();
        for (Structure s : payload.structures()) {
            if (s == null || s.id() == null || s.id().isBlank()) {
                throw new IllegalStateException("Structure with blank id in " + filePath);
            }
            if (!seenIds.add(s.id())) {
                throw new IllegalStateException("Duplicate structure id '" + s.id() + "' in " + filePath);
            }
            if (s.kind() == null || !VALID_KINDS.contains(s.kind())) {
                throw new IllegalStateException("Invalid structure kind '" + s.kind() + "' in " + filePath);
            }
            if (!Double.isFinite(s.x()) || !Double.isFinite(s.y()) || !Double.isFinite(s.z())
                    || !Double.isFinite(s.width()) || !Double.isFinite(s.height()) || !Double.isFinite(s.depth())
                    || s.width() <= 0 || s.height() <= 0 || s.depth() <= 0) {
                throw new IllegalStateException("Invalid structure dimensions or coordinates for id " + s.id());
            }
            if (s.color() == null || !HEX_COLOR_PATTERN.matcher(s.color()).matches()) {
                throw new IllegalStateException("Invalid structure color '" + s.color() + "' for id " + s.id());
            }
        }
    }
}
