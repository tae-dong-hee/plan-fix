package taedonghee.plan_fix.infrastructure.course;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface CourseMemberRevocationJpaRepository extends JpaRepository<CourseMemberRevocationJpaEntity, Long> {
    boolean existsByCourseIdAndRevokedThroughInviteIdGreaterThanEqual(Long courseId, Long inviteId);
    Optional<CourseMemberRevocationJpaEntity> findByCourseIdAndUserId(Long courseId, Long userId);
}
