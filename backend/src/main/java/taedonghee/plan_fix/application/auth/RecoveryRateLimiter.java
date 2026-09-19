package taedonghee.plan_fix.application.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.infrastructure.auth.RecoveryRateLimitJpaRepository;
import taedonghee.plan_fix.support.error.RateLimitException;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class RecoveryRateLimiter {
    private final RecoveryRateLimitJpaRepository limits;
    private final RecoveryRateLimitKey crypto;

    /** Committed separately, so invalid requests and transport failures cannot bypass limits. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void acquire(String domain, String subject, int hourlyLimit, int cooldownSeconds) {
        String key = crypto.hash("rate-" + domain, subject);
        limits.initialize(key);
        var bucket = limits.findForUpdate(key);
        Instant now = Instant.now();
        if (!bucket.acquire(now, hourlyLimit, cooldownSeconds)) {
            throw new RateLimitException(bucket.retryAfterSeconds(now, hourlyLimit, cooldownSeconds));
        }
    }
}
