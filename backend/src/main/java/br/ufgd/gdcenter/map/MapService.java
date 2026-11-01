package br.ufgd.gdcenter.map;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;

@Service
public class MapService {

    private final MapData mapData;

    public MapService(ObjectMapper objectMapper) {
        this.mapData = loadAndValidateMap(objectMapper, "maps/default.json");
    }

    public static MapData loadAndValidateMap(ObjectMapper objectMapper, String resourcePath) {
        ClassPathResource resource = new ClassPathResource(resourcePath);
        if (!resource.exists()) {
            throw new IllegalStateException("Map resource not found: " + resourcePath);
        }
        try (InputStream is = resource.getInputStream()) {
            MapData data = objectMapper.readValue(is, MapData.class);
            if (data == null) {
                throw new IllegalStateException("Map resource is empty: " + resourcePath);
            }
            data.validate();
            return data;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to load map from " + resourcePath, e);
        }
    }

    public MapData getMapData() {
        return mapData;
    }
}
