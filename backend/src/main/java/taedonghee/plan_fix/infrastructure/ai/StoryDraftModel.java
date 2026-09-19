package taedonghee.plan_fix.infrastructure.ai;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;

import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** Separate model with an application deadline, including a stalled provider response. */
public record StoryDraftModel(ChatLanguageModel model, Duration responseTimeout) {
    public static final Duration DEFAULT_RESPONSE_TIMEOUT = Duration.ofSeconds(35);

    public StoryDraftModel(ChatLanguageModel model) {
        this(model, DEFAULT_RESPONSE_TIMEOUT);
    }

    public StoryDraftModel {
        Objects.requireNonNull(model, "model");
        Objects.requireNonNull(responseTimeout, "responseTimeout");
        if (responseTimeout.isNegative() || responseTimeout.isZero()) {
            throw new IllegalArgumentException("responseTimeout must be positive");
        }
    }

    public ChatResponse chat(ChatRequest request) {
        Objects.requireNonNull(request, "request");
        // The installed Gemini adapter only applies its timeout to connecting.
        // A per-call virtual thread needs no executor to shut down or wait on.
        var response = new FutureTask<>(() -> model.chat(request));
        Thread.ofVirtual().name("travel-story-model").start(response);
        try {
            return response.get(responseTimeout.toNanos(), TimeUnit.NANOSECONDS);
        } catch (TimeoutException exception) {
            throw new IllegalStateException("Travel story model response timed out", exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Travel story model request interrupted", exception);
        } catch (ExecutionException exception) {
            if (exception.getCause() instanceof RuntimeException failure) throw failure;
            if (exception.getCause() instanceof Error failure) throw failure;
            throw new IllegalStateException("Travel story model request failed", exception.getCause());
        } finally {
            // Interrupting JDK HttpClient.send also cancels its pending HTTP exchange.
            response.cancel(true);
        }
    }
}
