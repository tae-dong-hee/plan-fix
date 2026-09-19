package taedonghee.plan_fix.infrastructure.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** One row per local account; keep the session version after consuming the token. */
@Entity
@Table(name = "password_reset_tokens")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PasswordResetJpaEntity {
    @Id
    private Long userId;

    @Column(length = 64, unique = true)
    private String tokenHash;

    private Instant requestedAt;
    private Instant expiresAt;

    @Column(nullable = false)
    private long sessionVersion;

    public PasswordResetJpaEntity(Long userId) {
        this.userId = userId;
    }

    public boolean isCoolingDown(Instant now) {
        return requestedAt != null && now.isBefore(requestedAt.plusSeconds(60));
    }

    public void issue(String tokenHash, Instant now) {
        this.tokenHash = tokenHash;
        this.requestedAt = now;
        this.expiresAt = now.plusSeconds(30 * 60);
    }

    public boolean accepts(String hash, Instant now) {
        return tokenHash != null && tokenHash.equals(hash) && expiresAt != null && now.isBefore(expiresAt);
    }

    public void consume() {
        tokenHash = null;
        expiresAt = null;
        sessionVersion++;
    }
}
