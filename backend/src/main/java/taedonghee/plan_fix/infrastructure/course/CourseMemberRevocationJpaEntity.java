package taedonghee.plan_fix.infrastructure.course;

import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 멤버 제거 전에 발급한 링크로 해당 사용자가 다시 권한을 얻지 못하게 한다. */
@Entity
@Table(name = "course_member_revocations", uniqueConstraints = @UniqueConstraint(
        name = "uq_course_member_revocations_course_user", columnNames = {"course_id", "user_id"}))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseMemberRevocationJpaEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "course_member_revocation_id") private Long id;
    @Column(name = "course_id", nullable = false) private Long courseId;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Column(name = "revoked_through_invite_id", nullable = false) private long revokedThroughInviteId;

    public CourseMemberRevocationJpaEntity(Long courseId, Long userId, long revokedThroughInviteId) {
        this.courseId = courseId;
        this.userId = userId;
        this.revokedThroughInviteId = revokedThroughInviteId;
    }

    public void revokeThrough(long inviteId) {
        revokedThroughInviteId = Math.max(revokedThroughInviteId, inviteId);
    }
}
