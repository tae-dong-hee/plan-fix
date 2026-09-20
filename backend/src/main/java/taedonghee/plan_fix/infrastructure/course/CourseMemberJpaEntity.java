package taedonghee.plan_fix.infrastructure.course;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

@Entity
@Table(name = "course_members", uniqueConstraints = @UniqueConstraint(name = "uq_course_members_course_user", columnNames = {"course_id", "user_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseMemberJpaEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "course_member_id") private Long courseMemberId;
    @Column(name = "course_id", nullable = false) private Long courseId;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20) private CourseMemberRole role;
    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz") private OffsetDateTime createdAt;
    // Nullable only for memberships created before invite-based role replacement.
    @Column(name = "last_applied_invite_id") private Long lastAppliedInviteId;

    @Builder
    private CourseMemberJpaEntity(Long courseId, Long userId, CourseMemberRole role, OffsetDateTime createdAt) {
        this.courseId = courseId;
        this.userId = userId;
        this.role = role;
        this.createdAt = createdAt;
    }
    public void changeRole(CourseMemberRole role) { this.role = role; }

    public void applyInviteRole(CourseMemberRole role, long inviteId) {
        this.role = role;
        this.lastAppliedInviteId = inviteId;
    }

    public void initializeInviteBaseline(long inviteId) {
        if (lastAppliedInviteId == null) lastAppliedInviteId = inviteId;
    }
}
