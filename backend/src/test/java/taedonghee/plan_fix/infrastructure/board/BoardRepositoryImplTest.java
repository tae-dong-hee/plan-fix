package taedonghee.plan_fix.infrastructure.board;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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
 * @Transactional로 각 테스트 종료 시 자동 롤백되어 로컬 DB에 더미 데이터를 남기지 않는다.
 */
@SpringBootTest
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
    void LATEST_정렬은_boardId_내림차순이다() {
        BoardModel first = saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());
        BoardModel second = saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());

        List<BoardModel> result = boardRepository.searchActive(BoardSortType.LATEST, 0, 100);

        List<Long> ids = result.stream()
                .map(BoardModel::boardId)
                .filter(id -> id.equals(first.boardId()) || id.equals(second.boardId()))
                .toList();

        assertThat(ids).containsExactly(second.boardId(), first.boardId());
    }

    @Test
    void POPULAR_정렬은_좋아요_0_9_조회수_0_1_가중합_내림차순이다() {
        // 점수: low=1*0.9+0*0.1=0.9, mid=0*0.9+50*0.1=5.0, high=10*0.9+0*0.1=9.0
        BoardModel low = saveBoard(BoardStatus.ACTIVE, 1, 0, List.of());
        BoardModel mid = saveBoard(BoardStatus.ACTIVE, 0, 50, List.of());
        BoardModel high = saveBoard(BoardStatus.ACTIVE, 10, 0, List.of());

        List<BoardModel> result = boardRepository.searchActive(BoardSortType.POPULAR, 0, 100);

        List<Long> ids = result.stream()
                .map(BoardModel::boardId)
                .filter(id -> id.equals(high.boardId()) || id.equals(mid.boardId()) || id.equals(low.boardId()))
                .toList();

        assertThat(ids).containsExactly(high.boardId(), mid.boardId(), low.boardId());
    }

    @Test
    void POPULAR_정렬에서_점수가_같으면_boardId_내림차순이다() {
        BoardModel first = saveBoard(BoardStatus.ACTIVE, 10, 0, List.of());
        BoardModel second = saveBoard(BoardStatus.ACTIVE, 10, 0, List.of());

        List<BoardModel> result = boardRepository.searchActive(BoardSortType.POPULAR, 0, 100);

        List<Long> ids = result.stream()
                .map(BoardModel::boardId)
                .filter(id -> id.equals(first.boardId()) || id.equals(second.boardId()))
                .toList();

        assertThat(ids).containsExactly(second.boardId(), first.boardId());
    }

    @Test
    void offset과_limit으로_구간을_잘라낸다() {
        saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());
        saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());
        saveBoard(BoardStatus.ACTIVE, 0, 0, List.of());

        List<BoardModel> page1 = boardRepository.searchActive(BoardSortType.LATEST, 0, 2);
        List<BoardModel> page2 = boardRepository.searchActive(BoardSortType.LATEST, 2, 2);

        assertThat(page1).hasSize(2);
        assertThat(page2).isNotEmpty();
        assertThat(page1).doesNotContainAnyElementsOf(page2);
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
                OffsetDateTime.now(),
                OffsetDateTime.now()
        );
        return boardRepository.save(board);
    }
}
