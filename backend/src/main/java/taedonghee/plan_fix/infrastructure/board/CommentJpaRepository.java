package taedonghee.plan_fix.infrastructure.board;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

/** comments 테이블을 조회·저장하는 Spring Data JPA Repository. */
public interface CommentJpaRepository extends JpaRepository<CommentJpaEntity, Long> {

    /** 게시글·상태별 댓글을 작성 시각, ID 오름차순으로 조회한다. */
    List<CommentJpaEntity> findByBoardIdAndStatusOrderByCreatedAtAscCommentIdAsc(
            Long boardId,
            String status
    );

    /** 댓글이 지정한 게시글에 속하며 요청한 상태인지 확인한다. */
    boolean existsByCommentIdAndBoardIdAndStatus(Long id, Long boardId, String status);

    /** 게시글별 활성 댓글과 대댓글 수를 한 번의 쿼리로 집계한다. */
    @Query("""
            SELECT c.boardId AS boardId, COUNT(c.commentId) AS commentCount
            FROM CommentJpaEntity c
            WHERE c.status = 'ACTIVE' AND c.boardId IN :boardIds
            GROUP BY c.boardId
            """)
    List<BoardCommentCount> countActiveByBoardIds(@Param("boardIds") Collection<Long> boardIds);

    interface BoardCommentCount {
        Long getBoardId();

        long getCommentCount();
    }
}
