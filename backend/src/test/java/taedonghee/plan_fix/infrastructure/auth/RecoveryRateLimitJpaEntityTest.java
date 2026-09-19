package taedonghee.plan_fix.infrastructure.auth;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class RecoveryRateLimitJpaEntityTest {
    private static final Instant START = Instant.parse("2026-09-19T00:00:00Z");

    @Test
    void twentyRequestsConsumeTheQuotaAndRejectedAttemptsDoNotExtendItsWindow() {
        var bucket = bucket();
        for (int attempt = 0; attempt < 20; attempt++) assertThat(bucket.acquire(START, 20, 0)).isTrue();

        assertThat(bucket.acquire(START.plusSeconds(59), 20, 0)).isFalse();
        assertThat(bucket.retryAfterSeconds(START.plusSeconds(59), 20, 0)).isEqualTo(3541);
        assertThat(bucket.acquire(START.plusSeconds(3599).plusNanos(999_999_999), 20, 0)).isFalse();
        assertThat(bucket.retryAfterSeconds(START.plusSeconds(3599).plusNanos(999_999_999), 20, 0)).isEqualTo(1);
        assertThat(bucket.acquire(START.plusSeconds(3600), 20, 0)).isTrue();
        for (int attempt = 1; attempt < 20; attempt++) assertThat(bucket.acquire(START.plusSeconds(3600), 20, 0)).isTrue();
        assertThat(bucket.acquire(START.plusSeconds(3600), 20, 0)).isFalse();
    }

    @Test
    void fractionalCooldownRoundsUpAndExactBoundaryAllowsRequest() {
        var bucket = bucket();
        assertThat(bucket.acquire(START, 5, 60)).isTrue();
        assertThat(bucket.retryAfterSeconds(START.plusSeconds(30).plusNanos(1), 5, 60)).isEqualTo(30);
        assertThat(bucket.acquire(START.plusSeconds(59).plusNanos(999_999_999), 5, 60)).isFalse();
        assertThat(bucket.retryAfterSeconds(START.plusSeconds(59).plusNanos(999_999_999), 5, 60)).isEqualTo(1);
        assertThat(bucket.acquire(START.plusSeconds(60), 5, 60)).isTrue();
    }

    @Test
    void exhaustedHourTakesPrecedenceOverShorterCooldown() {
        var bucket = bucket();
        for (int attempt = 0; attempt < 5; attempt++) assertThat(bucket.acquire(START.plusSeconds(attempt * 60L), 5, 60)).isTrue();

        assertThat(bucket.retryAfterSeconds(START.plusSeconds(250), 5, 60)).isEqualTo(3350);
        assertThat(bucket.acquire(START.plusSeconds(300), 5, 60)).isFalse();
        assertThat(bucket.retryAfterSeconds(START.plusSeconds(300), 5, 60)).isEqualTo(3300);
    }

    @Test
    void cooldownCanExtendPastTheHourWithoutResettingOnRejectedRequests() {
        var bucket = bucket();
        assertThat(bucket.acquire(START.plusSeconds(3590), 1, 60)).isTrue();
        assertThat(bucket.retryAfterSeconds(START.plusSeconds(3595), 1, 60)).isEqualTo(55);
        assertThat(bucket.acquire(START.plusSeconds(3600), 1, 60)).isFalse();
        assertThat(bucket.retryAfterSeconds(START.plusSeconds(3600), 1, 60)).isEqualTo(50);
        assertThat(bucket.acquire(START.plusSeconds(3650), 1, 60)).isTrue();
        assertThat(bucket.retryAfterSeconds(START.plusSeconds(3650), 1, 60)).isEqualTo(3600);
    }

    private static RecoveryRateLimitJpaEntity bucket() {
        var bucket = new RecoveryRateLimitJpaEntity();
        ReflectionTestUtils.setField(bucket, "windowStartedAt", START);
        return bucket;
    }
}
