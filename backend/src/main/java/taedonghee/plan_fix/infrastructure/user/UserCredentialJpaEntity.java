package taedonghee.plan_fix.infrastructure.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/**
 * user_credentials 테이블 JPA 매핑 엔티티
 */
@Entity
@Table(
        name = "user_credentials",
        uniqueConstraints = {
                @UniqueConstraint(name = "UK_USER_CREDENTIALS_USER_ID", columnNames = "user_id"),
                @UniqueConstraint(name = "UK_USER_CREDENTIALS_LOGIN_ID", columnNames = "login_id")
        }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserCredentialJpaEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_credential_id")
    private Long id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private UserJpaEntity user;

    @Column(length = 50)
    private String loginId;

    @Column(length = 100)
    private String password;

    private OffsetDateTime lastLoginAt;

    @Column(nullable = false)
    private OffsetDateTime createdAt;

    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    public void changePassword(String encryptedPassword) {
        this.password = encryptedPassword;
        this.updatedAt = OffsetDateTime.now();
    }

    /**
     * JPA 엔티티 생성
     */
    @Builder
    private UserCredentialJpaEntity(
            Long id,
            UserJpaEntity user,
            String loginId,
            String password,
            OffsetDateTime lastLoginAt,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        this.id = id;
        this.user = user;
        this.loginId = loginId;
        this.password = password;
        this.lastLoginAt = lastLoginAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
