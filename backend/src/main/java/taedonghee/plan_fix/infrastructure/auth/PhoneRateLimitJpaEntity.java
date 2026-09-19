package taedonghee.plan_fix.infrastructure.auth;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "phone_verification_rate_limits")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PhoneRateLimitJpaEntity {
    @Id
    @Column(length = 64)
    private String bucketKey;

    @Column(nullable = false)
    private Instant windowStartedAt;

    private Instant lastRequestedAt;

    @Column(nullable = false)
    private int requestCount;

    public boolean acquire(Instant now, int limit, int cooldownSeconds) {
        if (lastRequestedAt != null && now.isBefore(lastRequestedAt.plusSeconds(cooldownSeconds))) return false;
        if (!now.isBefore(windowStartedAt.plusSeconds(3600))) {
            windowStartedAt = now;
            requestCount = 0;
        }
        if (requestCount >= limit) return false;
        requestCount++;
        lastRequestedAt = now;
        return true;
    }
}
