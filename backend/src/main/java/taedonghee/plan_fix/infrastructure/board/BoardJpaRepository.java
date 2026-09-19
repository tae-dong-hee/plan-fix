package taedonghee.plan_fix.infrastructure.board;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import taedonghee.plan_fix.domain.board.BoardStatus;

import java.util.List;

/**
 * BoardJpaEntity Spring Data JPA Repository
 */
public interface BoardJpaRepository extends JpaRepository<BoardJpaEntity, Long> {

    /**
     * 사용자별 활성 게시글 목록 조회
     */
    List<BoardJpaEntity> findByUserIdAndStatusOrderByBoardIdDesc(Long userId, BoardStatus status);

    /**
     * 특정 코스가 활성 게시글에 연결되어 있는지 확인
     */
    boolean existsByCourseIdAndStatus(Long courseId, BoardStatus status);

    /**
     * 공개 목록 조회(최신순). status는 ACTIVE로 고정한다.
     * offset/limit은 JPQL의 LIMIT/OFFSET 절(Jakarta Persistence 3.1+)로 직접 처리한다.
     */
    @Query("""
            SELECT b FROM BoardJpaEntity b
            WHERE b.status = taedonghee.plan_fix.domain.board.BoardStatus.ACTIVE
            ORDER BY b.createdAt DESC, b.boardId DESC
            LIMIT :limit OFFSET :offset
            """)
    List<BoardJpaEntity> searchActiveByLatest(
            @Param("limit") int limit,
            @Param("offset") int offset
    );

    /**
     * 공개 목록 조회(인기순). 좋아요 수 내림차순이며, 동점이면 최신순으로 정렬한다.
     */
    @Query("""
            SELECT b FROM BoardJpaEntity b
            WHERE b.status = taedonghee.plan_fix.domain.board.BoardStatus.ACTIVE
            ORDER BY b.likeCount DESC, b.createdAt DESC, b.boardId DESC
            LIMIT :limit OFFSET :offset
            """)
    List<BoardJpaEntity> searchActiveByPopular(
            @Param("limit") int limit,
            @Param("offset") int offset
    );

    /**
     * 활성 게시글 전체 건수.
     */
    @Query("""
            SELECT COUNT(b) FROM BoardJpaEntity b
            WHERE b.status = taedonghee.plan_fix.domain.board.BoardStatus.ACTIVE
            """)
    long countActive();

    /**
     * view_count를 DB에서 직접 +1 한다.
     */
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @Query("UPDATE BoardJpaEntity b SET b.viewCount = b.viewCount + 1 WHERE b.boardId = :boardId")
    void incrementViewCount(@Param("boardId") Long boardId);

    /** 댓글 등록 시 댓글 수를 원자적으로 증가한다. */
    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE BoardJpaEntity b SET b.commentCount = b.commentCount + 1 WHERE b.boardId = :boardId")
    void incrementCommentCount(@Param("boardId") Long boardId);

    /** 댓글 삭제 시 댓글 수를 원자적으로 감소한다. */
    @org.springframework.data.jpa.repository.Modifying
    @Query("UPDATE BoardJpaEntity b SET b.commentCount = CASE WHEN b.commentCount > 0 THEN b.commentCount - 1 ELSE 0 END WHERE b.boardId = :boardId")
    void decrementCommentCount(@Param("boardId") Long boardId);

    /**
     * like_count를 DB에서 직접 +1 한다.
     */
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @Query("UPDATE BoardJpaEntity b SET b.likeCount = b.likeCount + 1 WHERE b.boardId = :boardId")
    void incrementLikeCount(@Param("boardId") Long boardId);

    /**
     * like_count를 DB에서 직접 -1 한다. 0 밑으로 내려가지 않게 CASE로 가드한다.
     */
    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true)
    @Query("""
            UPDATE BoardJpaEntity b
            SET b.likeCount = CASE WHEN b.likeCount > 0 THEN b.likeCount - 1 ELSE 0 END
            WHERE b.boardId = :boardId
            """)
    void decrementLikeCount(@Param("boardId") Long boardId);

    /**
     * 사용자가 좋아요 누른 활성 게시글 목록 조회 (최신 좋아요 순)
     */
    @Query("""
            SELECT b FROM BoardJpaEntity b
            JOIN BoardLikeJpaEntity bl ON b.boardId = bl.boardId
            WHERE bl.userId = :userId AND b.status = taedonghee.plan_fix.domain.board.BoardStatus.ACTIVE
            ORDER BY bl.createdAt DESC
            """)
    List<BoardJpaEntity> findLikedBoardsByUserId(@Param("userId") Long userId);
}
