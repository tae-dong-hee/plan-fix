package taedonghee.plan_fix.domain.board;

import java.util.List;
import java.util.Optional;

/**
 * Board 저장소 추상화
 */
public interface BoardRepository {

    /**
     * 게시글 저장 처리
     */
    BoardModel save(BoardModel board);

    /**
     * board_id 기반 게시글 단건 조회 처리
     */
    Optional<BoardModel> findById(Long boardId);

    /**
     * user_id 기반 활성 게시글 목록 조회 처리
     */
    List<BoardModel> findActiveByUserId(Long userId);

    /**
     * 공개 목록 조회. status가 ACTIVE인 것만, sort 기준으로 정렬해 offset부터 limit개를 반환한다.
     */
    List<BoardModel> searchActive(BoardSortType sort, int offset, int limit);

    /**
     * 활성 게시글 전체 건수 조회 (페이지네이션 totalCount용).
     */
    long countActive();

    /** 게시글 조회수 1 증가 (DB 원자적 update) */
    void incrementViewCount(Long boardId);

    /**
     * 좋아요 수 1 증가 (DB 원자적 update)
     */
    void incrementLikeCount(Long boardId);

    /**
     * 좋아요 수 1 감소 (0 이하로는 내려가지 않음)
     */
    void decrementLikeCount(Long boardId);

    /**
     * 사용자가 좋아요 누른 활성 게시글 목록 조회
     */
    List<BoardModel> findLikedByUserId(Long userId);

    /**
     * 코스가 활성 게시글에 연결되어 있는지 확인
     */
    boolean existsActiveByCourseId(Long courseId);
}
