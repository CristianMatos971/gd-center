package br.ufgd.gdcenter.map;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class MapControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void shouldReturnMapWithNoCacheHeaderAndExpectedConstants() throws Exception {
        mockMvc.perform(get("/api/map"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-cache"))
                .andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.sky.color").value("#87ceeb"))
                .andExpect(jsonPath("$.ground.y").value(0.0))
                .andExpect(jsonPath("$.ground.color").value("#4caf50"))
                .andExpect(jsonPath("$.bounds.minX").value(-100.0))
                .andExpect(jsonPath("$.bounds.maxX").value(100.0))
                .andExpect(jsonPath("$.bounds.minZ").value(-100.0))
                .andExpect(jsonPath("$.bounds.maxZ").value(100.0))
                .andExpect(jsonPath("$.spawnPoints.length()").value(4))
                .andExpect(jsonPath("$.boxes").isArray())
                .andExpect(jsonPath("$.physics.tickRate").value(60))
                .andExpect(jsonPath("$.physics.gravity").value(20.0))
                .andExpect(jsonPath("$.physics.walkSpeed").value(4.0))
                .andExpect(jsonPath("$.physics.runSpeed").value(7.0))
                .andExpect(jsonPath("$.physics.jumpSpeed").value(7.0))
                .andExpect(jsonPath("$.physics.player.width").value(0.6))
                .andExpect(jsonPath("$.physics.player.height").value(1.8))
                .andExpect(jsonPath("$.physics.player.depth").value(0.6))
                .andExpect(jsonPath("$.physics.player.eyeHeight").value(1.6));
    }

    @Test
    void shouldFailFastWhenMapResourceIsMissing() {
        assertThatThrownBy(() -> MapService.loadAndValidateMap(objectMapper, "maps/nonexistent.json"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Map resource not found");
    }
}
