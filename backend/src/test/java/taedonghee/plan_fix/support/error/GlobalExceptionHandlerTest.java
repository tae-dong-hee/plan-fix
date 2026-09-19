package taedonghee.plan_fix.support.error;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;

import static org.assertj.core.api.Assertions.*;

class GlobalExceptionHandlerTest {
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void knownRetryTimeProduces429AndExactRetryAfterWithoutChangingTheErrorContract() {
        var response = handler.handleCoreException(new RateLimitException(3541));

        assertThat(response.getStatusCode().value()).isEqualTo(429);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("3541");
        assertThat(response.getBody()).isEqualTo(ErrorResponse.of(ErrorType.TOO_MANY_REQUESTS,
                "요청이 많습니다. 3541초 후 다시 시도해 주세요."));
    }

    @Test
    void legacyRateLimitsAndAllOtherDomainErrorsKeepMessagesAndHaveNoInventedRetryTime() {
        for (ErrorType type : ErrorType.values()) {
            var response = handler.handleCoreException(new CoreException(type, "existing message"));
            assertThat(response.getStatusCode()).isEqualTo(type.getStatus());
            assertThat(response.getBody()).isEqualTo(ErrorResponse.of(type, "existing message"));
            assertThat(response.getHeaders().containsHeader(HttpHeaders.RETRY_AFTER)).isFalse();
        }
    }

    @Test
    void zeroOrNegativeRetryTimesCannotBeAdvertised() {
        assertThatIllegalArgumentException().isThrownBy(() -> new RateLimitException(0));
        assertThatIllegalArgumentException().isThrownBy(() -> new RateLimitException(-1));
    }
}
