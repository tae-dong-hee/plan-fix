package taedonghee.plan_fix.infrastructure.ai;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.googleai.GoogleAiGeminiChatModel;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

@Configuration
@EnableConfigurationProperties(GeminiProperties.class)
public class GeminiConfig {

    @Bean
    @ConditionalOnProperty(name = "gemini.api-key")
    public StoryDraftModel storyDraftModel(GeminiProperties properties) {
        if (properties.apiKey() == null || properties.apiKey().isBlank()) return null;
        return new StoryDraftModel(GoogleAiGeminiChatModel.builder()
                .apiKey(properties.apiKey())
                .modelName(properties.modelName())
                .temperature(0.7)
                .maxOutputTokens(2048)
                .maxRetries(0)
                .timeout(Duration.ofSeconds(60))
                .logRequestsAndResponses(false)
                .build());
    }

    @Bean
    @ConditionalOnProperty(name = "gemini.api-key")
    public ChatLanguageModel geminiChatModel(GeminiProperties properties) {
        if (properties.apiKey() == null || properties.apiKey().isBlank()) {
            return null;
        }
        return GoogleAiGeminiChatModel.builder()
                .apiKey(properties.apiKey())
                .modelName(properties.modelName())
                .temperature(0.7)
                .timeout(Duration.ofSeconds(60))
                // Multimodal requests contain private photos and notes.
                .logRequestsAndResponses(false)
                .build();
    }
}
