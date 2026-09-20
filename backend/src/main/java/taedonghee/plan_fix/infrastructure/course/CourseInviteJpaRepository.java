package taedonghee.plan_fix.infrastructure.course;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface CourseInviteJpaRepository extends JpaRepository<CourseInviteJpaEntity, Long> {
    @org.springframework.data.jpa.repository.Query("SELECT coalesce(max(i.courseInviteId), 0) FROM CourseInviteJpaEntity i WHERE i.courseId = :courseId")
    long latestInviteId(@org.springframework.data.repository.query.Param("courseId") Long courseId);
    long deleteByCourseId(Long courseId);
    Optional<CourseInviteJpaEntity> findByToken(String token);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("SELECT i FROM CourseInviteJpaEntity i WHERE i.token = :token")
    Optional<CourseInviteJpaEntity> findByTokenForUpdate(@org.springframework.data.repository.query.Param("token") String token);
    boolean existsByToken(String token);
    java.util.List<CourseInviteJpaEntity> findByCourseIdOrderByCreatedAtDesc(Long courseId);
}
