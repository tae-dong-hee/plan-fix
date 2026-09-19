package taedonghee.plan_fix.application.board;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.application.course.CourseApplicationService;
import taedonghee.plan_fix.domain.board.BoardImageModel;
import taedonghee.plan_fix.domain.board.BoardModel;
import taedonghee.plan_fix.domain.board.BoardRepository;
import taedonghee.plan_fix.domain.board.BoardStatus;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.support.error.CoreException;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class BoardApplicationServiceTest {

    @Test
    void create_validates_linked_course_owner_and_saves_board() {
        Fixture fixture = new Fixture();

        BoardResult result = fixture.service().create(10L, new BoardCommand.Create(
                1L,
                "Trip board",
                "<p><strong>Nice trip</strong></p>",
                null,
                List.of(new BoardImageModel("https://example.com/one.jpg", "cover"))
        ));

        assertThat(result.boardId()).isNotNull();
        assertThat(result.userId()).isEqualTo(10L);
        assertThat(result.courseId()).isEqualTo(1L);
        assertThat(result.images()).extracting(BoardResult.Image::sequence).containsExactly(0);
        assertThat(result.thumbnail()).isEqualTo("https://example.com/one.jpg");
        verify(fixture.courses).validatePublicCourseForBoard(10L, 1L);
    }

    @Test
    void create_without_course_does_not_validate_course() {
        Fixture fixture = new Fixture();

        BoardResult result = fixture.service().create(10L, new BoardCommand.Create(
                null,
                "Trip board",
                "<p>Content</p>",
                null,
                List.of()
        ));

        assertThat(result.courseId()).isNull();
        verify(fixture.courses, never()).validatePublicCourseForBoard(10L, null);
    }

    @Test
    void update_requires_board_owner() {
        Fixture fixture = new Fixture();
        BoardResult created = fixture.service().create(10L, new BoardCommand.Create(
                null, "Before", "<p>Before</p>", null, List.of()));

        assertThatThrownBy(() -> fixture.service().update(99L, created.boardId(), new BoardCommand.Update(
                null, "After", "<p>After</p>", null, List.of())))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void delete_soft_deletes_and_removes_from_my_list() {
        Fixture fixture = new Fixture();
        BoardResult created = fixture.service().create(10L, new BoardCommand.Create(
                null, "Board", "<p>Content</p>", null, List.of()));

        BoardResult deleted = fixture.service().delete(10L, created.boardId());

        assertThat(deleted.status()).isEqualTo(BoardStatus.DELETED);
        assertThat(fixture.service().listMine(10L)).isEmpty();
    }

    @Test
    void list_returns_items_and_total_count() {
        Fixture fixture = new Fixture();
        fixture.service().create(10L, new BoardCommand.Create(null, "Board 1", "<p>Content 1</p>", "thumb1.jpg", List.of()));
        fixture.service().create(10L, new BoardCommand.Create(null, "Board 2", "<p>Content 2</p>", "thumb2.jpg", List.of()));

        BoardListResult result = fixture.service().list(new BoardListQuery(null, 0, 20));

        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.items()).hasSize(2);
        assertThat(result.items().getFirst().title()).isEqualTo("Board 2");
        assertThat(result.items().getFirst().thumbnail()).isEqualTo("thumb2.jpg");
        assertThat(result.items().getFirst().userId()).isEqualTo(10L);
    }

    @Test
    void list_returns_offset_and_size() {
        Fixture fixture = new Fixture();
        BoardListResult result = fixture.service().list(new BoardListQuery(null, 10, 5));

        assertThat(result.offset()).isEqualTo(10);
        assertThat(result.size()).isEqualTo(5);
    }

    @Test
    void list_throws_when_offset_is_negative() {
        Fixture fixture = new Fixture();
        assertThatThrownBy(() -> fixture.service().list(new BoardListQuery(null, -1, 20)))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void list_throws_when_size_is_less_than_1() {
        Fixture fixture = new Fixture();
        assertThatThrownBy(() -> fixture.service().list(new BoardListQuery(null, 0, 0)))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void list_throws_when_size_exceeds_100() {
        Fixture fixture = new Fixture();
        assertThatThrownBy(() -> fixture.service().list(new BoardListQuery(null, 0, 101)))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void list_sort_defaults_to_latest() {
        Fixture fixture = new Fixture();
        fixture.service().create(10L, new BoardCommand.Create(null, "Board 1", "<p>Content 1</p>", null, List.of()));
        fixture.service().create(10L, new BoardCommand.Create(null, "Board 2", "<p>Content 2</p>", null, List.of()));

        BoardListResult result = fixture.service().list(new BoardListQuery(null, 0, 20));

        assertThat(result.items()).extracting(BoardListResult.Item::title).containsExactly("Board 2", "Board 1");
    }

    @Test
    void list_sort_supports_popular_and_latest() {
        Fixture fixture = new Fixture();
        BoardResult b1 = fixture.service().create(10L, new BoardCommand.Create(null, "Board 1", "<p>Content 1</p>", null, List.of()));
        BoardResult b2 = fixture.service().create(10L, new BoardCommand.Create(null, "Board 2", "<p>Content 2</p>", null, List.of()));
        fixture.boards.incrementLikeCount(b1.boardId());

        BoardListResult latestResult = fixture.service().list(new BoardListQuery("latest", 0, 20));
        assertThat(latestResult.items()).extracting(BoardListResult.Item::boardId).containsExactly(b2.boardId(), b1.boardId());

        BoardListResult popularResult = fixture.service().list(new BoardListQuery("popular", 0, 20));
        assertThat(popularResult.items()).extracting(BoardListResult.Item::boardId).containsExactly(b1.boardId(), b2.boardId());
    }

    @Test
    void list_throws_when_sort_is_unknown() {
        Fixture fixture = new Fixture();
        assertThatThrownBy(() -> fixture.service().list(new BoardListQuery("unknown_sort", 0, 20)))
                .isInstanceOf(CoreException.class);
    }

    private static CourseModel course(Long userId, Long courseId) {
        return CourseModel.reconstruct(
                courseId,
                userId,
                "Course",
                null,
                null,
                CourseVisibility.PRIVATE,
                taedonghee.plan_fix.domain.course.CourseStatus.ACTIVE,
                0L,
                0L,
                null,
                null,
                List.of(new taedonghee.plan_fix.domain.course.CourseDayModel(1, List.of(new CourseSpotModel(1L, null)))),
                null,
                null
        );
    }

    static class Fixture {
        final InMemoryBoardRepository boards = new InMemoryBoardRepository();
        final CourseApplicationService courses = mock(CourseApplicationService.class);
        final taedonghee.plan_fix.domain.board.BoardLikeRepository boardLikes = mock(taedonghee.plan_fix.domain.board.BoardLikeRepository.class);

        BoardApplicationService service() {
            return new BoardApplicationService(boards, courses, boardLikes);
        }
    }

    static class InMemoryBoardRepository implements BoardRepository {
        private final List<BoardModel> saved = new ArrayList<>();
        private long sequence = 0L;

        @Override
        public BoardModel save(BoardModel board) {
            BoardModel stored = BoardModel.reconstruct(
                    board.boardId() == null ? ++sequence : board.boardId(),
                    board.courseId(),
                    board.userId(),
                    board.title(),
                    board.content(),
                    board.thumbnail(),
                    board.status(),
                    board.viewCount(),
                    board.likeCount(),
                    board.commentCount(),
                    board.images(),
                    board.createdAt(),
                    board.updatedAt()
            );
            saved.removeIf(existing -> existing.boardId().equals(stored.boardId()));
            saved.add(stored);
            return stored;
        }

        @Override
        public Optional<BoardModel> findById(Long boardId) {
            return saved.stream().filter(board -> board.boardId().equals(boardId)).findFirst();
        }

        @Override
        public List<BoardModel> findActiveByUserId(Long userId) {
            return saved.stream()
                    .filter(board -> board.userId().equals(userId))
                    .filter(board -> board.status() == BoardStatus.ACTIVE)
                    .toList();
        }

        @Override
        public List<BoardModel> searchActive(taedonghee.plan_fix.domain.board.BoardSortType sort, int offset, int limit) {
            Comparator<BoardModel> latest = Comparator.comparing(BoardModel::createdAt)
                    .thenComparing(BoardModel::boardId).reversed();
            return saved.stream()
                    .filter(board -> board.status() == BoardStatus.ACTIVE)
                    .sorted(switch (sort) {
                        case LATEST -> latest;
                        case POPULAR -> Comparator.comparingLong(BoardModel::likeCount).reversed().thenComparing(latest);
                    })
                    .skip(offset)
                    .limit(limit)
                    .toList();
        }

        @Override
        public long countActive() {
            return saved.stream()
                    .filter(board -> board.status() == BoardStatus.ACTIVE)
                    .count();
        }

        @Override
        public void incrementViewCount(Long boardId) {
            findById(boardId).ifPresent(b -> save(BoardModel.reconstruct(
                    b.boardId(), b.courseId(), b.userId(), b.title(), b.content(),
                    b.thumbnail(), b.status(), b.viewCount() + 1, b.likeCount(), b.commentCount(), b.images(),
                    b.createdAt(), b.updatedAt())));
        }

        @Override
        public void incrementLikeCount(Long boardId) {
            findById(boardId).ifPresent(b -> {
                saved.remove(b);
                saved.add(BoardModel.reconstruct(b.boardId(), b.courseId(), b.userId(), b.title(), b.content(),
                        b.thumbnail(), b.status(), b.viewCount(), b.likeCount() + 1, b.commentCount(), b.images(),
                        b.createdAt(), b.updatedAt()));
            });
        }

        @Override
        public void decrementLikeCount(Long boardId) {
            findById(boardId).ifPresent(b -> {
                saved.remove(b);
                saved.add(BoardModel.reconstruct(b.boardId(), b.courseId(), b.userId(), b.title(), b.content(),
                        b.thumbnail(), b.status(), b.viewCount(), Math.max(b.likeCount() - 1, 0), b.commentCount(), b.images(),
                        b.createdAt(), b.updatedAt()));
            });
        }

        /** 좋아요 목록 조회는 이 테스트에서 쓰지 않는다. 조용히 빈 값을 주기보다 호출되면 바로 드러나게 둔다. */
        @Override
        public List<BoardModel> findLikedByUserId(Long userId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public boolean existsActiveByCourseId(Long courseId) {
            if (courseId == null) return false;
            return saved.stream()
                    .anyMatch(b -> courseId.equals(b.courseId()) && b.status() == BoardStatus.ACTIVE);
        }

        @Override
        public void unlinkCourse(Long courseId) {
            saved.replaceAll(b -> courseId.equals(b.courseId())
                    ? BoardModel.reconstruct(b.boardId(), null, b.userId(), b.title(), b.content(),
                        b.thumbnail(), b.status(), b.viewCount(), b.likeCount(), b.commentCount(),
                        b.images(), b.createdAt(), b.updatedAt())
                    : b);
        }
    }
}
