package taedonghee.plan_fix.application.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.infrastructure.auth.RecoveryRateLimitJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

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
        if (!limits.findForUpdate(key).acquire(Instant.now(), hourlyLimit, cooldownSeconds)) {
            throw new CoreException(ErrorType.TOO_MANY_REQUESTS,
                    cooldownSeconds > 0 ? "안내 메일은 60초 후 다시 요청할 수 있으며, 1시간에 최대 5회 발송됩니다."
                            : "요청이 많습니다. 잠시 후 다시 시도해 주세요.");
        }
    }
}
