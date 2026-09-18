package taedonghee.plan_fix.infrastructure.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.domain.user.UserStatus;

import java.time.OffsetDateTime;
import java.time.LocalDate;

/**
 * users 테이블 JPA 매핑 엔티티
 */
@Entity
@Table(
        name = "users",
        uniqueConstraints = {
                @UniqueConstraint(name = "UK_USERS_USERNAME", columnNames = "username"),
                @UniqueConstraint(name = "UK_USERS_EMAIL", columnNames = "email")
        }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class UserJpaEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "user_id")
    private Long id;

    @Column(nullable = false, length = 30)
    private String username;

    @Column(length = 30)
    private String name;

    @Column(length = 255)
    private String email;

    @Column(name = "birth_date")
    private LocalDate birthDate;

    @Column(name = "profile_image_key", length = 255)
    private String profileImageKey;

    @Column(name = "default_avatar_color", nullable = false, length = 10)
    private String defaultAvatarColor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserStatus status;

    @Column(nullable = false)
    private OffsetDateTime createdAt;

    @Column(nullable = false)
    private OffsetDateTime updatedAt;

    /**
     * JPA 엔티티 생성
     */
    @Builder
    private UserJpaEntity(
            Long id,
            String username,
            String name,
            String email,
            LocalDate birthDate,
            String profileImageKey,
            String defaultAvatarColor,
            UserRole role,
            UserStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        this.id = id;
        this.username = username;
        this.name = name;
        this.email = email;
        this.birthDate = birthDate;
        this.profileImageKey = profileImageKey;
        this.defaultAvatarColor = defaultAvatarColor;
        this.role = role;
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
