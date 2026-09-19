package taedonghee.plan_fix.domain.course;

import java.util.List;
import java.util.Optional;

/**
 * Course 저장소 추상화
 */
public interface CourseRepository {

    /**
     * 코스 저장 처리
     */
    CourseModel save(CourseModel course);

    /**
     * course_id 기반 코스 단건 조회 처리
     */
    Optional<CourseModel> findById(Long courseId);

    /** 공개 범위 변경과 초대·좋아요·게시글 연결을 같은 코스 잠금으로 직렬화한다. */
    Optional<CourseModel> findByIdForUpdate(Long courseId);

    /**
     * user_id 기반 활성 코스 목록 조회 처리
     */
    List<CourseModel> findActiveByUserId(Long userId);

    /** 공동 코스 멤버십으로 접근 가능한 활성 코스 목록. */
    List<CourseModel> findActiveByIds(java.util.Collection<Long> courseIds);

    /**
     * 사용자가 좋아요 누른 활성 코스 목록 조회
     */
    List<CourseModel> findLikedByUserId(Long userId);

    /** 공개 상태인 활성 코스를 정렬·페이지네이션해 조회 */
    List<CourseModel> searchPublic(CourseSortType sort, int offset, int limit);

    /** 공개 상태인 활성 코스 전체 개수 */
    long countPublic();

    void incrementLikeCount(Long courseId);

    void decrementLikeCount(Long courseId);
}
