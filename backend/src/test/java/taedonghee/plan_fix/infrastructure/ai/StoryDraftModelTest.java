package taedonghee.plan_fix.infrastructure.ai;

import dev.langchain4j.data.message.AiMessage;
import dev.langchain4j.data.message.UserMessage;
import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.chat.request.ChatRequest;
import dev.langchain4j.model.chat.response.ChatResponse;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeout;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StoryDraftModelTest {
    private final ChatLanguageModel provider = mock(ChatLanguageModel.class);
    private final ChatRequest request = ChatRequest.builder().messages(UserMessage.from("travel photo")).build();

    @Test void returnsProviderResponseAndFinishesItsVirtualThread() throws Exception {
        var expected = ChatResponse.builder().aiMessage(AiMessage.from("짧은 여행 기록")).build();
        var worker = new AtomicReference<Thread>();
        when(provider.chat(request)).thenAnswer(invocation -> {
            worker.set(Thread.currentThread());
            return expected;
        });

        assertThat(new StoryDraftModel(provider).chat(request)).isSameAs(expected);

        assertThat(worker.get().isVirtual()).isTrue();
        assertThat(worker.get().join(Duration.ofSeconds(1))).isTrue();
        verify(provider).chat(request);
    }

    @Test void propagatesProviderFailureWithoutRetrying() {
        var failure = new IllegalArgumentException("provider rejected request");
        when(provider.chat(request)).thenThrow(failure);

        assertThatThrownBy(() -> new StoryDraftModel(provider).chat(request)).isSameAs(failure);

        verify(provider).chat(request);
    }

    @Test void responseDeadlineCancelsAndInterruptsAStalledProvider() throws Exception {
        var interrupted = new CountDownLatch(1);
        var worker = new AtomicReference<Thread>();
        when(provider.chat(request)).thenAnswer(invocation -> {
            worker.set(Thread.currentThread());
            try {
                new CountDownLatch(1).await(5, TimeUnit.SECONDS);
                return null;
            } catch (InterruptedException exception) {
                interrupted.countDown();
                throw new IllegalStateException(exception);
            }
        });
        var model = new StoryDraftModel(provider, Duration.ofMillis(100));

        assertTimeout(Duration.ofSeconds(2), () ->
                assertThatThrownBy(() -> model.chat(request))
                        .isInstanceOf(IllegalStateException.class).hasCauseInstanceOf(TimeoutException.class));

        assertThat(interrupted.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(worker.get().join(Duration.ofSeconds(1))).isTrue();
        verify(provider).chat(request);
    }

    @Test void callerInterruptionCancelsProviderAndPreservesInterruptFlag() throws Exception {
        var started = new CountDownLatch(1);
        var workerInterrupted = new CountDownLatch(1);
        when(provider.chat(request)).thenAnswer(invocation -> {
            started.countDown();
            try {
                new CountDownLatch(1).await(5, TimeUnit.SECONDS);
                return null;
            } catch (InterruptedException exception) {
                workerInterrupted.countDown();
                throw new IllegalStateException(exception);
            }
        });
        var failure = new AtomicReference<Throwable>();
        var interruptPreserved = new AtomicBoolean();
        var caller = Thread.ofVirtual().start(() -> {
            try {
                new StoryDraftModel(provider).chat(request);
            } catch (RuntimeException exception) {
                failure.set(exception);
                interruptPreserved.set(Thread.currentThread().isInterrupted());
            }
        });
        try {
            assertThat(started.await(1, TimeUnit.SECONDS)).isTrue();
            caller.interrupt();

            assertThat(caller.join(Duration.ofSeconds(1))).isTrue();
            assertThat(failure.get()).isInstanceOf(IllegalStateException.class).hasCauseInstanceOf(InterruptedException.class);
            assertThat(interruptPreserved).isTrue();
            assertThat(workerInterrupted.await(1, TimeUnit.SECONDS)).isTrue();
        } finally {
            caller.interrupt();
            caller.join(Duration.ofSeconds(1));
        }
    }

    @Test void rejectsNonPositiveResponseTimeouts() {
        assertThatThrownBy(() -> new StoryDraftModel(provider, Duration.ZERO)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new StoryDraftModel(provider, Duration.ofSeconds(-1))).isInstanceOf(IllegalArgumentException.class);
    }
}
