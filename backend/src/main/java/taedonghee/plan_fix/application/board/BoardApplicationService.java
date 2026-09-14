package taedonghee.plan_fix.application.board;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.application.course.CourseApplicationService;
import taedonghee.plan_fix.domain.board.BoardModel;
import taedonghee.plan_fix.domain.board.BoardRepository;
import taedonghee.plan_fix.domain.board.BoardSortType;
import taedonghee.plan_fix.domain.board.BoardStatus;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;

/**
 * 게시글 Application Service
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class BoardApplicationService {

    private static final int MAX_SIZE = 100;

    private final BoardRepository boardRepository;
    private final CourseApplicationService courseApplicationService;
    private final taedonghee.plan_fix.domain.board.BoardLikeRepository boardLikeRepository;

    /**
     * 게시글 생성 처리
     */
    @Transactional
    public BoardResult create(Long userId, BoardCommand.Create command) {
        validateLinkedCourse(userId, command.courseId()); // 게시글에 연결할 코스가 로그인 사용자의 코스인지 검증
        if (command.courseId() != null) {
            courseApplicationService.ensureCoursePublicForBoard(userId, command.courseId());
        }
        BoardModel board = BoardModel.create(userId, command.courseId(), command.title(), command.content(),
                command.thumbnail(), command.images());
        return BoardResult.from(boardRepository.save(board));
    }

    /**
     * 로그인 사용자의 게시글 목록 조회 처리
     */
    public List<BoardResult> listMine(Long userId) {
        return boardRepository.findActiveByUserId(userId).stream()
                .map(BoardResult::from)
                .toList();
    }

    /**
     * 로그인 사용자가 좋아요 누른 게시글 목록 조회 처리
     */
    public List<BoardResult> listLiked(Long userId) {
        return boardRepository.findLikedByUserId(userId).stream()
                .map(board -> BoardResult.from(board, true))
                .toList();
    }

    /**
     * 공개 게시글 목록 조회 처리
     */
    public BoardListResult list(BoardListQuery query) {
        validate(query);
        BoardSortType sort = parseSort(query.sort());

        List<BoardModel> boards = boardRepository.searchActive(sort, query.offset(), query.size());
        long totalCount = boardRepository.countActive();
        List<BoardListResult.Item> items = boards.stream().map(BoardListResult.Item::from).toList();

        return new BoardListResult(items, query.offset(), query.size(), totalCount);
    }

    private void validate(BoardListQuery query) {
        if (query.offset() < 0) {
            throw new CoreException(ErrorType.BAD_REQUEST, "offset은 0 이상이어야 합니다.");
        }
        if (query.size() < 1 || query.size() > MAX_SIZE) {
            throw new CoreException(ErrorType.BAD_REQUEST, "size는 1~" + MAX_SIZE + " 사이여야 합니다.");
        }
    }

    private BoardSortType parseSort(String sort) {
        if (sort == null) {
            return BoardSortType.LATEST;
        }
        return switch (sort) {
            case "latest" -> BoardSortType.LATEST;
            case "popular" -> BoardSortType.POPULAR;
            default -> throw new CoreException(ErrorType.BAD_REQUEST, "sort는 latest 또는 popular만 가능합니다. sort=" + sort);
        };
    }

    /**
     * 게시글 단건 조회 처리 (비로그인)
     */
    public BoardResult get(Long boardId) {
        return get(boardId, null);
    }

    /**
     * 게시글 단건 조회 처리 (조회자 좋아요 여부 반영)
     */
    @Transactional
    public BoardResult get(Long boardId, Long viewerUserId) {
        // 상세 조회가 성공한 게시글만 조회수에 반영되도록 먼저 활성 게시글인지 확인한다.
        BoardModel board = getActiveBoardOrThrow(boardId);
        boardRepository.incrementViewCount(boardId);
        // 원자적 증가 후 최신 view_count를 다시 읽어 응답한다.
        board = getActiveBoardOrThrow(boardId);
        boolean isLiked = viewerUserId != null && boardLikeRepository.existsByUserIdAndBoardId(viewerUserId, boardId);
        return BoardResult.from(board, isLiked);
    }

    /**
     * 로그인 사용자의 게시글 수정 처리
     */
    @Transactional
    public BoardResult update(Long userId, Long boardId, BoardCommand.Update command) {
        BoardModel board = getActiveBoardOrThrow(boardId);
        board.ensureOwner(userId); // 작성자만 수정 가능
        validateLinkedCourse(userId, command.courseId()); // 새로 연결할 코스 소유권 검증
        if (command.courseId() != null) {
            courseApplicationService.ensureCoursePublicForBoard(userId, command.courseId());
        }
        BoardModel updated = board.update(command.courseId(), command.title(), command.content(),
                command.thumbnail(), command.images());
        return BoardResult.from(boardRepository.save(updated));
    }

    /**
     * 로그인 사용자의 게시글 삭제 상태 변경 처리
     */
    @Transactional
    public BoardResult delete(Long userId, Long boardId) {
        BoardModel board = getActiveBoardOrThrow(boardId);
        board.ensureOwner(userId); // 작성자만 삭제 가능
        return BoardResult.from(boardRepository.save(board.delete()));
    }

    /**
     * 활성 게시글 조회 실패 예외 처리
     */
    private BoardModel getActiveBoardOrThrow(Long boardId) {
        return boardRepository.findById(boardId)
                .filter(board -> board.status() == BoardStatus.ACTIVE)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "board not found. boardId=" + boardId));
    }

    /**
     * 게시글에 연결된 코스가 로그인 사용자의 활성 코스인지 검증
     */
    private void validateLinkedCourse(Long userId, Long courseId) {
        if (courseId != null) {
            courseApplicationService.getActiveOwnedCourseOrThrow(userId, courseId);
        }
    }
}
