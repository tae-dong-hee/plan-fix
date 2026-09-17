package taedonghee.plan_fix.infrastructure.board;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import taedonghee.plan_fix.domain.board.BoardImageModel;
import taedonghee.plan_fix.domain.board.BoardModel;
import taedonghee.plan_fix.domain.board.BoardRepository;
import taedonghee.plan_fix.domain.board.BoardSortType;
import taedonghee.plan_fix.domain.board.BoardStatus;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

/**
 * BoardRepository JPA 구현체
 */
@Repository
@RequiredArgsConstructor
public class BoardRepositoryImpl implements BoardRepository {

    private final BoardJpaRepository boardJpaRepository;
    private final BoardImageJpaRepository boardImageJpaRepository;
    private final CommentJpaRepository commentJpaRepository;

    /**
     * 게시글 저장 처리
     */
    @Override
    public BoardModel save(BoardModel board) {
        BoardJpaEntity saved = boardJpaRepository.save(toEntity(board));
        // 게시글 이미지 순서를 단순하게 맞추기 위해 기존 목록을 지우고 다시 저장한다
        boardImageJpaRepository.deleteByBoardId(saved.getBoardId());
        boardImageJpaRepository.flush();
        boardImageJpaRepository.saveAll(IntStream.range(0, board.images().size())
                .mapToObj(index -> BoardImageJpaEntity.builder()
                        .boardId(saved.getBoardId())
                        .imageUrl(board.images().get(index).imageUrl())
                        .altText(board.images().get(index).altText())
                        .sequence(index)
                        .createdAt(OffsetDateTime.now())
                        .build())
                .toList());
        return toDomain(saved);
    }

    /**
     * board_id 기반 게시글 단건 조회 처리
     */
    @Override
    public Optional<BoardModel> findById(Long boardId) {
        return boardJpaRepository.findById(boardId)
                .map(entity -> toDomainsWithActualCommentCounts(List.of(entity)).getFirst());
    }

    /**
     * user_id 기반 활성 게시글 목록 조회 처리
     */
    @Override
    public List<BoardModel> findActiveByUserId(Long userId) {
        List<BoardJpaEntity> entities = boardJpaRepository
                .findByUserIdAndStatusOrderByBoardIdDesc(userId, BoardStatus.ACTIVE);
        return toDomainsWithActualCommentCounts(entities);
    }

    /**
     * 공개 게시글 목록 조회
     */
    @Override
    public List<BoardModel> searchActive(BoardSortType sort, int offset, int limit) {
        List<BoardJpaEntity> entities = switch (sort) {
            case LATEST -> boardJpaRepository.searchActiveByLatest(limit, offset);
            case POPULAR -> boardJpaRepository.searchActiveByPopular(limit, offset);
        };
        return toDomainsWithActualCommentCounts(entities);
    }

    /**
     * 활성 게시글 전체 건수
     */
    @Override
    public long countActive() {
        return boardJpaRepository.countActive();
    }

    @Override
    public void incrementViewCount(Long boardId) {
        boardJpaRepository.incrementViewCount(boardId);
    }

    @Override
    public void incrementLikeCount(Long boardId) {
        boardJpaRepository.incrementLikeCount(boardId);
    }

    @Override
    public void decrementLikeCount(Long boardId) {
        boardJpaRepository.decrementLikeCount(boardId);
    }

    @Override
    public List<BoardModel> findLikedByUserId(Long userId) {
        return toDomainsWithActualCommentCounts(boardJpaRepository.findLikedBoardsByUserId(userId));
    }

    @Override
    public boolean existsActiveByCourseId(Long courseId) {
        if (courseId == null) {
            return false;
        }
        return boardJpaRepository.existsByCourseIdAndStatus(courseId, taedonghee.plan_fix.domain.board.BoardStatus.ACTIVE);
    }

    /**
     * 도메인 모델을 JPA 엔티티로 변환
     */
    private BoardJpaEntity toEntity(BoardModel board) {
        return BoardJpaEntity.builder()
                .boardId(board.boardId())
                .courseId(board.courseId())
                .userId(board.userId())
                .title(board.title())
                .content(board.content())
                .thumbnail(board.thumbnail())
                .status(board.status())
                .viewCount(board.viewCount())
                .likeCount(board.likeCount())
                .commentCount(board.commentCount())
                .createdAt(board.createdAt())
                .updatedAt(board.updatedAt())
                .build();
    }

    /**
     * JPA 엔티티와 board_images 목록을 도메인 모델로 변환
     */
    private BoardModel toDomain(BoardJpaEntity entity) {
        return toDomain(entity, entity.getCommentCount());
    }

    /** 목록 응답은 누적 컬럼이 아니라 현재 활성 댓글 행을 기준으로 실제 댓글 수를 사용한다. */
    private List<BoardModel> toDomainsWithActualCommentCounts(List<BoardJpaEntity> entities) {
        if (entities.isEmpty()) {
            return List.of();
        }
        List<Long> boardIds = entities.stream().map(BoardJpaEntity::getBoardId).toList();
        Map<Long, Long> commentCounts = commentJpaRepository.countActiveByBoardIds(boardIds).stream()
                .collect(Collectors.toMap(
                        CommentJpaRepository.BoardCommentCount::getBoardId,
                        CommentJpaRepository.BoardCommentCount::getCommentCount
                ));
        return entities.stream()
                .map(entity -> toDomain(entity, commentCounts.getOrDefault(entity.getBoardId(), 0L)))
                .toList();
    }

    private BoardModel toDomain(BoardJpaEntity entity, long commentCount) {
        List<BoardImageModel> images = boardImageJpaRepository.findByBoardIdOrderBySequenceAsc(entity.getBoardId())
                .stream()
                .map(image -> new BoardImageModel(image.getImageUrl(), image.getAltText()))
                .toList();
        return BoardModel.reconstruct(entity.getBoardId(), entity.getCourseId(), entity.getUserId(),
                entity.getTitle(), entity.getContent(), entity.getThumbnail(), entity.getStatus(),
                entity.getViewCount(), entity.getLikeCount(), commentCount, images,
                entity.getCreatedAt(), entity.getUpdatedAt());
    }
}
