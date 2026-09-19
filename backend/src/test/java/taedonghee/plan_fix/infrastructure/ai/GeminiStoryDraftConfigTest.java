package taedonghee.plan_fix.infrastructure.ai;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class GeminiStoryDraftConfigTest {
    private final GeminiConfig config = new GeminiConfig();

    @Test void photoModelHasNoAutomaticRetriesAndBoundedOutput() {
        var storyModel = config.storyDraftModel(new GeminiProperties("test-key-not-used", "test-model"));
        var model = storyModel.model();
        assertThat(storyModel.responseTimeout()).isEqualTo(Duration.ofSeconds(35));
        assertThat(ReflectionTestUtils.getField(model, "maxRetries")).isEqualTo(0);
        assertThat(ReflectionTestUtils.getField(model, "maxOutputTokens")).isEqualTo(2048);
        assertThat(ReflectionTestUtils.getField(model, "modelName")).isEqualTo("test-model");
    }

    @Test void missingKeyLeavesFeatureUnavailable() {
        assertThat(config.storyDraftModel(new GeminiProperties("", null))).isNull();
    }
}
