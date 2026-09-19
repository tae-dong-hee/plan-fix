package taedonghee.plan_fix.infrastructure.auth;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class PasswordResetJpaEntityTest {
    @Test
    void cooldownUsesTheExistingIssueTimeWithCeilingAndExactBoundary() {
        Instant issuedAt = Instant.parse("2026-09-19T00:00:00.123456789Z");
        var reset = new PasswordResetJpaEntity(1L);
        assertThat(reset.cooldownRemainingSeconds(issuedAt)).isZero();

        reset.issue("hash", issuedAt);

        assertThat(reset.cooldownRemainingSeconds(issuedAt)).isEqualTo(60);
        assertThat(reset.cooldownRemainingSeconds(issuedAt.plusNanos(1))).isEqualTo(60);
        assertThat(reset.cooldownRemainingSeconds(issuedAt.plusSeconds(37))).isEqualTo(23);
        assertThat(reset.cooldownRemainingSeconds(issuedAt.plusSeconds(60).minusNanos(1))).isEqualTo(1);
        assertThat(reset.isCoolingDown(issuedAt.plusSeconds(60).minusNanos(1))).isTrue();
        assertThat(reset.cooldownRemainingSeconds(issuedAt.plusSeconds(60))).isZero();
        assertThat(reset.isCoolingDown(issuedAt.plusSeconds(60))).isFalse();
        assertThat(reset.cooldownRemainingSeconds(issuedAt.plusSeconds(61))).isZero();
    }
}
