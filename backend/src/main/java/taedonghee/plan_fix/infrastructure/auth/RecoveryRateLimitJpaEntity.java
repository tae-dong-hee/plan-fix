package taedonghee.plan_fix.infrastructure.auth;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.Duration;
import java.time.Instant;

@Entity
@Table(name = "account_recovery_rate_limits")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RecoveryRateLimitJpaEntity {
    @Id
    @Column(length = 64)
    private String bucketKey;

    @Column(nullable = false)
    private Instant windowStartedAt;

    private Instant lastRequestedAt;

    @Column(nullable = false)
    private int requestCount;

    public boolean acquire(Instant now, int limit, int cooldownSeconds) {
        if (retryAfterSeconds(now, limit, cooldownSeconds) > 0) return false;
        if (!now.isBefore(windowStartedAt.plusSeconds(3600))) {
            windowStartedAt = now;
            requestCount = 0;
        }
        requestCount++;
        lastRequestedAt = now;
        return true;
    }

    /** Both limits must have elapsed; round up so a retry never arrives before the boundary. */
    public long retryAfterSeconds(Instant now, int limit, int cooldownSeconds) {
        Instant availableAt = now;
        if (lastRequestedAt != null && lastRequestedAt.plusSeconds(cooldownSeconds).isAfter(availableAt)) {
            availableAt = lastRequestedAt.plusSeconds(cooldownSeconds);
        }
        Instant windowEndsAt = windowStartedAt.plusSeconds(3600);
        if (requestCount >= limit && windowEndsAt.isAfter(availableAt)) {
            availableAt = windowEndsAt;
        }
        Duration remaining = Duration.between(now, availableAt);
        return remaining.getSeconds() + (remaining.getNano() > 0 ? 1 : 0);
    }
}
