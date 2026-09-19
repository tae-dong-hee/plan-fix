package taedonghee.plan_fix.application.board;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.Clock;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class StoryDraftRateLimiterTest {
    private final Clock clock = mock(Clock.class);
    private final StoryDraftRateLimiter limiter = new StoryDraftRateLimiter(clock);
    private final Instant start = Instant.parse("2026-09-01T00:00:00Z");

    @Test void enforcesOneInFlightRequestAndAllowsImmediateRegenerationAfterRelease() {
        when(clock.instant()).thenReturn(start);
        var permit = limiter.acquire(7L);
        limited(() -> limiter.acquire(7L));
        permit.close();
        permit.close();
        limiter.acquire(7L).close();
    }

    @Test void hourlyLimitExpiresAndUsersAreIndependent() {
        for (int i = 0; i < 10; i++) {
            when(clock.instant()).thenReturn(start.plusSeconds(i * 10L));
            limiter.acquire(7L).close();
        }
        when(clock.instant()).thenReturn(start.plusSeconds(100));
        limited(() -> limiter.acquire(7L));
        limiter.acquire(8L).close();
        when(clock.instant()).thenReturn(start.plusSeconds(3600));
        limiter.acquire(7L).close();
    }

    @Test void capsConcurrentWorkAndAllowsNewWorkAfterRelease() {
        when(clock.instant()).thenReturn(start);
        var first = limiter.acquire(1L);
        limiter.acquire(2L);
        limiter.acquire(3L);
        limiter.acquire(4L);
        limited(() -> limiter.acquire(5L));
        first.close();
        limiter.acquire(5L).close();
    }

    private static void limited(Runnable operation) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(CoreException.class,
                exception -> assertThat(exception.getErrorType()).isEqualTo(ErrorType.TOO_MANY_REQUESTS));
    }
}
