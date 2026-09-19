package taedonghee.plan_fix.infrastructure.course;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CourseMemberJpaRepository extends JpaRepository<CourseMemberJpaEntity, Long> {
    long deleteByCourseId(Long courseId);
    boolean existsByCourseIdAndUserId(Long courseId, Long userId);
    boolean existsByCourseIdAndUserIdAndRole(Long courseId, Long userId, CourseMemberRole role);
    List<CourseMemberJpaEntity> findByCourseIdOrderByCreatedAtAsc(Long courseId);
    List<CourseMemberJpaEntity> findByUserIdOrderByCreatedAtDesc(Long userId);
    long deleteByCourseIdAndUserIdAndRoleIn(Long courseId, Long userId, java.util.Collection<CourseMemberRole> roles);
}
