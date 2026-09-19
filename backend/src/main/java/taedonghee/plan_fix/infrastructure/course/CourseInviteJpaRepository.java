package taedonghee.plan_fix.infrastructure.course;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface CourseInviteJpaRepository extends JpaRepository<CourseInviteJpaEntity, Long> {
    long deleteByCourseId(Long courseId);
    Optional<CourseInviteJpaEntity> findByToken(String token);
    boolean existsByToken(String token);
    java.util.List<CourseInviteJpaEntity> findByCourseIdOrderByCreatedAtDesc(Long courseId);
}
