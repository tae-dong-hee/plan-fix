package taedonghee.plan_fix.infrastructure.course;

import org.springframework.data.jpa.repository.JpaRepository;

import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;

import java.util.List;

/**
 * CourseJpaEntity Spring Data JPA Repository
 */
public interface CourseJpaRepository extends JpaRepository<CourseJpaEntity, Long> {

    @org.springframework.data.jpa.repository.Query("""
            SELECT c FROM CourseJpaEntity c
            WHERE c.status = taedonghee.plan_fix.domain.course.CourseStatus.ACTIVE
              AND c.visibility = taedonghee.plan_fix.domain.course.CourseVisibility.PUBLIC
            ORDER BY c.courseId DESC
            LIMIT :limit OFFSET :offset
            """)
    List<CourseJpaEntity> searchPublicByLatest(
            @org.springframework.data.repository.query.Param("limit") int limit,
            @org.springframework.data.repository.query.Param("offset") int offset
    );

    @org.springframework.data.jpa.repository.Query("""
            SELECT c FROM CourseJpaEntity c
            WHERE c.status = taedonghee.plan_fix.domain.course.CourseStatus.ACTIVE
              AND c.visibility = taedonghee.plan_fix.domain.course.CourseVisibility.PUBLIC
            ORDER BY (c.likeCount * 0.9 + c.viewCount * 0.1) DESC, c.courseId DESC
            LIMIT :limit OFFSET :offset
            """)
    List<CourseJpaEntity> searchPublicByPopular(
            @org.springframework.data.repository.query.Param("limit") int limit,
            @org.springframework.data.repository.query.Param("offset") int offset
    );

    @org.springframework.data.jpa.repository.Query("""
            SELECT c FROM CourseJpaEntity c
            WHERE c.status = taedonghee.plan_fix.domain.course.CourseStatus.ACTIVE
              AND c.visibility = taedonghee.plan_fix.domain.course.CourseVisibility.PUBLIC
            ORDER BY function('random')
            LIMIT :limit OFFSET :offset
            """)
    List<CourseJpaEntity> searchPublicByRandom(
            @org.springframework.data.repository.query.Param("limit") int limit,
            @org.springframework.data.repository.query.Param("offset") int offset
    );

    @org.springframework.data.jpa.repository.Query("""
            SELECT COUNT(c) FROM CourseJpaEntity c
            WHERE c.status = taedonghee.plan_fix.domain.course.CourseStatus.ACTIVE
              AND c.visibility = taedonghee.plan_fix.domain.course.CourseVisibility.PUBLIC
            """)
    long countPublic();

    /**
     * 사용자별 활성 코스 목록 조회
     */
    List<CourseJpaEntity> findByUserIdAndStatusOrderByCourseIdDesc(Long userId, CourseStatus status);

    List<CourseJpaEntity> findByCourseIdInAndStatusOrderByCourseIdDesc(java.util.Collection<Long> courseIds, CourseStatus status);

    /**
     * 사용자가 좋아요 누른 활성 코스 목록 조회 (최신 좋아요 순)
     */
    @org.springframework.data.jpa.repository.Query("""
            SELECT c FROM CourseJpaEntity c
            JOIN CourseLikeJpaEntity cl ON c.courseId = cl.courseId
            WHERE cl.userId = :userId AND c.status = taedonghee.plan_fix.domain.course.CourseStatus.ACTIVE
            ORDER BY cl.createdAt DESC
            """)
    List<CourseJpaEntity> findLikedCoursesByUserId(@org.springframework.data.repository.query.Param("userId") Long userId);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("UPDATE CourseJpaEntity c SET c.likeCount = c.likeCount + 1 WHERE c.courseId = :courseId")
    void incrementLikeCount(@org.springframework.data.repository.query.Param("courseId") Long courseId);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @org.springframework.data.jpa.repository.Query("""
            UPDATE CourseJpaEntity c
            SET c.likeCount = CASE WHEN c.likeCount > 0 THEN c.likeCount - 1 ELSE 0 END
            WHERE c.courseId = :courseId
            """)
    void decrementLikeCount(@org.springframework.data.repository.query.Param("courseId") Long courseId);
}
