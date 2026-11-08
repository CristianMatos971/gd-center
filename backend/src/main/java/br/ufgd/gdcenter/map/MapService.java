package br.ufgd.gdcenter.map;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@Service
public class MapService {

    private static final String MAP_RESOURCE_PATH = "maps/ufgd-campus.json";
    private static final String PHYSICS_RESOURCE_PATH = "game-physics.json";

    private record CampusSettingsFile(
            int version,
            String name,
            MapData.Sky sky,
            MapData.Ground ground,
            MapData.Bounds bounds,
            List<MapData.SpawnPoint> spawnPoints,
            BuildConfig build
    ) {}

    private final MapData mapData;

    public MapService(ObjectMapper objectMapper) {
        this.mapData = loadAndValidate(objectMapper, MAP_RESOURCE_PATH, PHYSICS_RESOURCE_PATH);
    }

    public static MapData loadAndValidate(
            ObjectMapper objectMapper,
            String mapResourcePath,
            String physicsResourcePath
    ) {
        CampusSettingsFile campus = readResource(objectMapper, mapResourcePath, CampusSettingsFile.class);
        MapData.Physics physics = readResource(objectMapper, physicsResourcePath, MapData.Physics.class);

        MapData combined = new MapData(
                campus.version(),
                campus.name(),
                campus.sky(),
                campus.ground(),
                campus.bounds(),
                campus.spawnPoints(),
                physics,
                campus.build()
        );
        combined.validate();
        return combined;
    }

    private static <T> T readResource(ObjectMapper objectMapper, String resourcePath, Class<T> type) {
        ClassPathResource resource = new ClassPathResource(resourcePath);
        if (!resource.exists()) {
            throw new IllegalStateException("Required resource not found: " + resourcePath);
        }
        try (InputStream is = resource.getInputStream()) {
            T data = objectMapper.readValue(is, type);
            if (data == null) {
                throw new IllegalStateException("Resource is empty: " + resourcePath);
            }
            return data;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to load resource from " + resourcePath, e);
        }
    }

    public MapData getMapData() {
        return mapData;
    }
}
