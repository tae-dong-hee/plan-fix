package taedonghee.plan_fix.infrastructure.course;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "course_invites", indexes = @Index(name = "idx_course_invites_course_id", columnList = "course_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseInviteJpaEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "course_invite_id") private Long courseInviteId;
    @Column(name = "course_id", nullable = false) private Long courseId;
    @Column(name = "created_by_user_id", nullable = false) private Long createdByUserId;
    @Column(nullable = false, unique = true, length = 64) private String token;
    @Enumerated(EnumType.STRING) @Column(name = "member_role", nullable = false, length = 20) private CourseMemberRole memberRole;
    @Column(name = "expires_at", nullable = false, columnDefinition = "timestamptz") private OffsetDateTime expiresAt;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz") private OffsetDateTime createdAt;

    @ElementCollection
    @CollectionTable(name = "course_invite_kakao_shares", joinColumns = @JoinColumn(name = "course_invite_id"),
            uniqueConstraints = @UniqueConstraint(columnNames = {"course_invite_id", "share_request_id"}))
    @Column(name = "share_request_id", nullable = false)
    private Set<UUID> kakaoShareRequestIds = new HashSet<>();

    public void recordKakaoShare(UUID requestId) {
        kakaoShareRequestIds.add(requestId);
    }

    @Builder
    private CourseInviteJpaEntity(Long courseId, Long createdByUserId, String token, CourseMemberRole memberRole, OffsetDateTime expiresAt, OffsetDateTime createdAt) {
        this.courseId = courseId;
        this.createdByUserId = createdByUserId;
        this.token = token;
        this.memberRole = memberRole;
        this.expiresAt = expiresAt;
        this.createdAt = createdAt;
    }
}
