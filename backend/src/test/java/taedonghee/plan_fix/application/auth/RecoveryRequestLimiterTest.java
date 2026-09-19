package taedonghee.plan_fix.application.auth;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RecoveryRequestLimiterTest {
    private final RecoveryRateLimiter persistentLimits = mock(RecoveryRateLimiter.class);
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withBean(RecoveryRateLimiter.class, () -> persistentLimits)
            .withBean(RecoveryRequestLimiter.class);

    @Test
    void defaultsAllowSharedProxyTrafficAndKeepRequestAndConfirmationBucketsSeparate() {
        context.run(application -> {
            assertThat(application).hasNotFailed();
            var limiter = application.getBean(RecoveryRequestLimiter.class);

            for (int user = 0; user < 25; user++) {
                limiter.acquireRequest("169.254.1.1");
                limiter.acquireConfirmation("169.254.1.1");
            }

            verify(persistentLimits, times(25)).acquire("recovery-request-peer", "169.254.1.1", 1000, 0);
            verify(persistentLimits, times(25)).acquire("recovery-confirmation-peer", "169.254.1.1", 3000, 0);
            verifyNoMoreInteractions(persistentLimits);
        });
    }

    @Test
    void configuredCeilingsAreAppliedWithoutTrustingAnyForwardedAddress() {
        context.withPropertyValues("app.account-recovery.request-hourly-limit=2000",
                        "app.account-recovery.confirmation-hourly-limit=6000")
                .run(application -> {
                    assertThat(application).hasNotFailed();
                    var limiter = application.getBean(RecoveryRequestLimiter.class);

                    limiter.acquireRequest("2001:db8::1");
                    limiter.acquireConfirmation("2001:db8::2");

                    verify(persistentLimits).acquire("recovery-request-peer", "2001:db8::1", 2000, 0);
                    verify(persistentLimits).acquire("recovery-confirmation-peer", "2001:db8::2", 6000, 0);
                    verifyNoMoreInteractions(persistentLimits);
                });
    }

    @Test
    void missingPeersShareOneBucketInsteadOfBypassingTheCeiling() {
        var limiter = new RecoveryRequestLimiter(persistentLimits, 1000, 3000);

        limiter.acquireRequest(null);
        limiter.acquireRequest("");
        limiter.acquireRequest(" ");
        limiter.acquireConfirmation(null);

        verify(persistentLimits, times(3)).acquire("recovery-request-peer", "unknown", 1000, 0);
        verify(persistentLimits).acquire("recovery-confirmation-peer", "unknown", 3000, 0);
    }

    @Test
    void exhaustingPersistentQuotaCannotBecomeSuccess() {
        var limiter = new RecoveryRequestLimiter(persistentLimits, 1000, 3000);
        var rejection = new CoreException(ErrorType.TOO_MANY_REQUESTS);
        doThrow(rejection).when(persistentLimits).acquire("recovery-request-peer", "127.0.0.1", 1000, 0);
        doThrow(rejection).when(persistentLimits).acquire("recovery-confirmation-peer", "127.0.0.1", 3000, 0);

        assertThatThrownBy(() -> limiter.acquireRequest("127.0.0.1")).isSameAs(rejection);
        assertThatThrownBy(() -> limiter.acquireConfirmation("127.0.0.1")).isSameAs(rejection);
    }

    @Test
    void nonPositiveCeilingsFailConfigurationInsteadOfSilentlyRemovingTheLimit() {
        for (String setting : new String[]{"request-hourly-limit=0", "request-hourly-limit=-1",
                "confirmation-hourly-limit=0", "confirmation-hourly-limit=-1"}) {
            context.withPropertyValues("app.account-recovery." + setting)
                    .run(application -> assertThat(application).hasFailed());
        }
        verifyNoInteractions(persistentLimits);
    }
}
