package taedonghee.plan_fix.infrastructure.auth;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "phone_verification_challenges", indexes = {
        @Index(name = "idx_phone_challenge_phone", columnList = "phone_number")
})
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PhoneChallengeJpaEntity {
    public enum Purpose { SIGNUP, FIND_ID, RESET_PASSWORD, BIND }

    @Id
    @Column(length = 43)
    private String id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Purpose purpose;

    @Column(nullable = false, length = 11)
    private String phoneNumber;

    private Long userId;

    @Column(nullable = false, length = 64)
    private String codeHash;

    @Column(nullable = false)
    private Instant expiresAt;

    @Column(nullable = false)
    private int attempts;

    @Column(nullable = false)
    private boolean verified;

    @Column(nullable = false)
    private boolean consumed;

    @Column(length = 64, unique = true)
    private String receiptHash;

    private Instant receiptExpiresAt;

    public PhoneChallengeJpaEntity(String id, Purpose purpose, String phoneNumber, Long userId,
                                   String codeHash, Instant now) {
        this.id = id;
        this.purpose = purpose;
        this.phoneNumber = phoneNumber;
        this.userId = userId;
        this.codeHash = codeHash;
        this.expiresAt = now.plusSeconds(300);
    }

    public void failedAttempt() { attempts++; }

    public void verifySignup(String receiptHash, Instant now) {
        verified = true;
        this.receiptHash = receiptHash;
        receiptExpiresAt = now.plusSeconds(900);
    }

    public boolean acceptsReceipt(Instant now) {
        return purpose == Purpose.SIGNUP && verified && !consumed
                && receiptExpiresAt != null && now.isBefore(receiptExpiresAt);
    }

    public void consume() {
        verified = true;
        consumed = true;
        receiptHash = null;
    }
}
