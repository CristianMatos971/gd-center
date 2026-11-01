package br.ufgd.gdcenter.movement;

import br.ufgd.gdcenter.map.MapData;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.io.File;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class MovementSystemTest {

    private static final double TOLERANCE = 1e-6;

    public record GoldenFile(List<Scenario> scenarios) {}

    public record Scenario(
            String name,
            String description,
            MapData.Physics physics,
            MapData.Ground ground,
            MapData.Bounds bounds,
            List<MapData.MapBox> boxes,
            MovementSystem.State initialState,
            List<MovementSystem.Input> inputs,
            MovementSystem.State expectedFinalState
    ) {}

    @Test
    void shouldMatchAllGoldenScenarios() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        File file = new File("../shared/movement-vectors.json");
        if (!file.exists()) {
            file = new File("shared/movement-vectors.json");
        }
        assertThat(file).exists();

        GoldenFile goldenFile = mapper.readValue(file, GoldenFile.class);
        assertThat(goldenFile.scenarios()).hasSizeGreaterThanOrEqualTo(8);

        for (Scenario scenario : goldenFile.scenarios()) {
            MovementSystem.State state = scenario.initialState();
            for (MovementSystem.Input input : scenario.inputs()) {
                state = MovementSystem.step(
                        state,
                        input,
                        scenario.physics(),
                        scenario.ground(),
                        scenario.bounds(),
                        scenario.boxes()
                );
            }

            MovementSystem.State expected = scenario.expectedFinalState();
            assertThat(state.x())
                    .as("Scenario %s: x", scenario.name())
                    .isCloseTo(expected.x(), within(TOLERANCE));
            assertThat(state.y())
                    .as("Scenario %s: y", scenario.name())
                    .isCloseTo(expected.y(), within(TOLERANCE));
            assertThat(state.z())
                    .as("Scenario %s: z", scenario.name())
                    .isCloseTo(expected.z(), within(TOLERANCE));
            assertThat(state.vy())
                    .as("Scenario %s: vy", scenario.name())
                    .isCloseTo(expected.vy(), within(TOLERANCE));
            assertThat(state.onGround())
                    .as("Scenario %s: onGround", scenario.name())
                    .isEqualTo(expected.onGround());
        }
    }
}
