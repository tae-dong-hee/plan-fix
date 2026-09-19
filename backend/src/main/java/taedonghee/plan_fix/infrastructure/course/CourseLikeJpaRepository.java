package taedonghee.plan_fix.infrastructure.course;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface CourseLikeJpaRepository extends JpaRepository<CourseLikeJpaEntity, Long> {

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM CourseLikeJpaEntity c WHERE c.courseId = :courseId AND c.userId <> :ownerId")
    int deleteOtherUsersLikes(@Param("courseId") Long courseId, @Param("ownerId") Long ownerId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            UPDATE CourseJpaEntity c
            SET c.likeCount = (SELECT COUNT(cl) FROM CourseLikeJpaEntity cl WHERE cl.courseId = :courseId)
            WHERE c.courseId = :courseId
            """)
    void synchronizeCourseLikeCount(@Param("courseId") Long courseId);

    Optional<CourseLikeJpaEntity> findByUserIdAndCourseId(Long userId, Long courseId);

    @Modifying
    @Query("DELETE FROM CourseLikeJpaEntity c WHERE c.userId = :userId AND c.courseId = :courseId")
    long deleteByUserIdAndCourseId(@Param("userId") Long userId, @Param("courseId") Long courseId);
}
