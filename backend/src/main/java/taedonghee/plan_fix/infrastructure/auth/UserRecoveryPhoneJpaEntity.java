package taedonghee.plan_fix.infrastructure.auth;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;

/** Only a successfully verified phone may be inserted into this table. */
@Entity
@Table(name = "user_recovery_phones")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserRecoveryPhoneJpaEntity {
    @Id
    private Long userId;

    @Column(nullable = false, unique = true, length = 11)
    private String phoneNumber;

    @Column(nullable = false)
    private Instant verifiedAt;

    public UserRecoveryPhoneJpaEntity(Long userId, String phoneNumber) {
        this.userId = userId;
        change(phoneNumber);
    }

    public void change(String phoneNumber) {
        this.phoneNumber = phoneNumber;
        this.verifiedAt = Instant.now();
    }
}
