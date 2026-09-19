package taedonghee.plan_fix.support.error;

import lombok.Getter;

/** A rate limit whose next allowed attempt is known. Legacy 429 errors remain unchanged. */
@Getter
public class RateLimitException extends CoreException {
    private final long retryAfterSeconds;

    public RateLimitException(long retryAfterSeconds) {
        super(ErrorType.TOO_MANY_REQUESTS,
                "요청이 많습니다. " + retryAfterSeconds + "초 후 다시 시도해 주세요.");
        if (retryAfterSeconds <= 0) {
            throw new IllegalArgumentException("Retry-After must be positive");
        }
        this.retryAfterSeconds = retryAfterSeconds;
    }
}
