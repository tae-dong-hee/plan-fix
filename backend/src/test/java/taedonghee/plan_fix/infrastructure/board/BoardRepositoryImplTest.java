package taedonghee.plan_fix.infrastructure.board;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.board.BoardImageModel;
import taedonghee.plan_fix.domain.board.BoardModel;
import taedonghee.plan_fix.domain.board.BoardRepository;
import taedonghee.plan_fix.domain.board.BoardSortType;
import taedonghee.plan_fix.domain.board.BoardStatus;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 공개 게시글 목록 조회가 실제 DB에서 필터·정렬·offset/limit대로 동작하는지 검증한다.
 * 임시 PostgreSQL을 사용하며 @Transactional로 테스트 사이의 데이터도 롤백한다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class BoardRepositoryImplTest {

    @Autowired
    private BoardRepository boardRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CommentJpaRepository commentJpaRepository;

    private Long userId;

    @BeforeEach
    void setUp() {
        UserModel user = userRepository.save(UserModel.create("bt" + (System.currentTimeMillis() % 1000000), null, null));
        this.userId = user.getUserId();
    }

    @Test
    void status가_ACTIVE인_게시글만_반환한다() {
        BoardModel active = saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());
        BoardModel deleted = saveBoard(BoardStatus.DELETED, 0, 0, List.of());

        List<BoardModel> result = boardRepository.searchActive(BoardSortType.LATEST, 0, 100);

        List<Long> ids = result.stream().map(BoardModel::boardId).toList();
        assertThat(ids).contains(active.boardId());
        assertThat(ids).doesNotContain(deleted.boardId());
    }

    @Test
    void LATEST_정렬은_좋아요와_ID보다_등록시각을_우선한다() {
        OffsetDateTime now = OffsetDateTime.now();
        BoardModel newer = saveBoard(BoardStatus.ACTIVE, 0, 0, List.of(), now);
        BoardModel older = saveBoard(BoardStatus.ACTIVE, 100, 0, List.of(), now.minusDays(1));

        List<BoardModel> result = boardRepository.searchActive(BoardSortType.LATEST, 0, 100);

        List<Long> ids = result.stream()
                .map(BoardModel::boardId)
                .filter(id -> id.equals(newer.boardId()) || id.equals(older.boardId()))
                .toList();

        assertThat(ids).containsExactly(newer.boardId(), older.boardId());
    }

    @Test
    void POPULAR_정렬은_조회수와_무관하게_좋아요_많은_순이다() {
        BoardModel low = saveBoard(BoardStatus.ACTIVE, 0, 1_000_000, List.of());
        BoardModel mid = saveBoard(BoardStatus.ACTIVE, 1, 50, List.of());
        BoardModel high = saveBoard(BoardStatus.ACTIVE, 10, 0, List.of());

        List<BoardModel> result = boardRepository.searchActive(BoardSortType.POPULAR, 0, 100);

        List<Long> ids = result.stream()
                .map(BoardModel::boardId)
                .filter(id -> id.equals(high.boardId()) || id.equals(mid.boardId()) || id.equals(low.boardId()))
                .toList();

        assertThat(ids).containsExactly(high.boardId(), mid.boardId(), low.boardId());
    }

    @Test
    void POPULAR_정렬에서_좋아요가_같으면_조회수와_ID보다_등록시각을_우선한다() {
        OffsetDateTime now = OffsetDateTime.now();
        BoardModel newer = saveBoard(BoardStatus.ACTIVE, 10, 0, List.of(), now);
        BoardModel older = saveBoard(BoardStatus.ACTIVE, 10, 1_000_000, List.of(), now.minusDays(1));

        List<BoardModel> result = boardRepository.searchActive(BoardSortType.POPULAR, 0, 100);

        List<Long> ids = result.stream()
                .map(BoardModel::boardId)
                .filter(id -> id.equals(newer.boardId()) || id.equals(older.boardId()))
                .toList();

        assertThat(ids).containsExactly(newer.boardId(), older.boardId());
    }

    @ParameterizedTest
    @EnumSource(BoardSortType.class)
    void 좋아요와_등록시각이_같아도_페이지마다_ID_내림차순으로_중복없이_반환한다(BoardSortType sort) {
        OffsetDateTime sameCreatedAt = OffsetDateTime.now();
        BoardModel first = saveBoard(BoardStatus.ACTIVE, 10, 100, List.of(), sameCreatedAt);
        BoardModel second = saveBoard(BoardStatus.ACTIVE, 10, 10, List.of(), sameCreatedAt);
        BoardModel third = saveBoard(BoardStatus.ACTIVE, 10, 0, List.of(), sameCreatedAt);
        saveBoard(BoardStatus.DELETED, 100, 0, List.of(), sameCreatedAt.plusDays(1));

        List<BoardModel> page1 = boardRepository.searchActive(sort, 0, 2);
        List<BoardModel> page2 = boardRepository.searchActive(sort, 2, 2);

        assertThat(page1).extracting(BoardModel::boardId).containsExactly(third.boardId(), second.boardId());
        assertThat(page2).extracting(BoardModel::boardId).containsExactly(first.boardId());
    }

    @Test
    void countActive는_ACTIVE인_게시글만_센다() {
        long initialCount = boardRepository.countActive();

        saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());
        saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());
        saveBoard(BoardStatus.DELETED, 0, 0, List.of());

        long count = boardRepository.countActive();

        assertThat(count).isEqualTo(initialCount + 2);
    }

    @Test
    void searchActive로_조회시_이미지_목록이_함께_반환된다() {
        List<BoardImageModel> images = List.of(
                new BoardImageModel("https://example.com/1.jpg", "첫번째"),
                new BoardImageModel("https://example.com/2.jpg", "두번째")
        );
        BoardModel saved = saveBoard(BoardStatus.ACTIVE, 0, 0, images);

        List<BoardModel> result = boardRepository.searchActive(BoardSortType.LATEST, 0, 100);

        BoardModel found = result.stream()
                .filter(b -> b.boardId().equals(saved.boardId()))
                .findFirst()
                .orElseThrow();

        assertThat(found.images()).hasSize(2);
        assertThat(found.images().get(0).imageUrl()).isEqualTo("https://example.com/1.jpg");
        assertThat(found.images().get(1).imageUrl()).isEqualTo("https://example.com/2.jpg");
    }

    @Test
    void searchActive는_활성_댓글의_실제_개수를_반환한다() {
        BoardModel saved = saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());
        saveComment(saved.boardId(), "ACTIVE");
        saveComment(saved.boardId(), "ACTIVE");
        saveComment(saved.boardId(), "DELETED");

        BoardModel found = boardRepository.searchActive(BoardSortType.LATEST, 0, 100).stream()
                .filter(board -> board.boardId().equals(saved.boardId()))
                .findFirst()
                .orElseThrow();

        assertThat(found.commentCount()).isEqualTo(2);
    }

    private void saveComment(Long boardId, String status) {
        OffsetDateTime now = OffsetDateTime.now();
        commentJpaRepository.save(CommentJpaEntity.builder()
                .userId(userId)
                .boardId(boardId)
                .content("테스트 댓글")
                .status(status)
                .createdAt(now)
                .updatedAt(now)
                .build());
    }

    private BoardModel saveBoard(BoardStatus status, long likeCount, long viewCount, List<BoardImageModel> images) {
        return saveBoard(status, likeCount, viewCount, images, OffsetDateTime.now());
    }

    private BoardModel saveBoard(BoardStatus status, long likeCount, long viewCount, List<BoardImageModel> images,
                                 OffsetDateTime createdAt) {
        BoardModel board = BoardModel.reconstruct(
                null,
                null,
                userId,
                "테스트게시글 " + System.nanoTime(),
                "<p>내용</p>",
                null,
                status,
                viewCount,
                likeCount,
                0L,
                images == null ? List.of() : images,
                createdAt,
                OffsetDateTime.now()
        );
        return boardRepository.save(board);
    }
}
