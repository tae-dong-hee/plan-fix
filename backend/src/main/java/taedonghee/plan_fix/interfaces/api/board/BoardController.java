package taedonghee.plan_fix.interfaces.api.board;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import taedonghee.plan_fix.application.board.BoardApplicationService;
import taedonghee.plan_fix.application.board.BoardListQuery;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;

import java.util.List;

/**
 * 게시글 API HTTP Controller
 */
@RestController
@RequestMapping("/api/v1/boards")
@RequiredArgsConstructor
public class BoardController {

    private final BoardApplicationService boardApplicationService;

    /**
     * 게시글 생성 API
     */
    @PostMapping
    public ResponseEntity<BoardResponse> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestBody BoardRequest.Create request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(BoardResponse.from(boardApplicationService.create(principal.id(), request.toCommand())));
    }

    /**
     * 공개 게시글 목록 조회 API
     * sort=latest는 최신순, sort=popular는 좋아요 많은 순으로 조회한다.
     * 예: GET /api/v1/boards?sort=popular&offset=0&size=20
     */
    @GetMapping
    public ResponseEntity<BoardListResponse> list(
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "20") int size
    ) {
        BoardListQuery query = new BoardListQuery(sort, offset, size);
        return ResponseEntity.ok(BoardListResponse.from(boardApplicationService.list(query)));
    }

    /**
     * 로그인 사용자의 게시글 목록 조회 API
     */
    @GetMapping("/mine")
    public ResponseEntity<List<BoardResponse>> listMine(@AuthenticationPrincipal AuthenticatedUser principal) {
        List<BoardResponse> responses = boardApplicationService.listMine(principal.id()).stream()
                .map(BoardResponse::from)
                .toList();
        return ResponseEntity.ok(responses);
    }

    /**
     * 게시글 단건 조회 API
     */
    @GetMapping("/{boardId}")
    public ResponseEntity<BoardResponse> get(
            @PathVariable Long boardId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        Long viewerUserId = principal != null ? principal.id() : null;
        return ResponseEntity.ok(BoardResponse.from(boardApplicationService.get(boardId, viewerUserId)));
    }

    /**
     * 로그인 사용자의 게시글 수정 API
     */
    @PatchMapping("/{boardId}")
    public ResponseEntity<BoardResponse> update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable Long boardId,
            @RequestBody BoardRequest.Update request
    ) {
        return ResponseEntity.ok(BoardResponse.from(
                boardApplicationService.update(principal.id(), boardId, request.toCommand())));
    }

    /**
     * 로그인 사용자의 게시글 삭제 API
     */
    @DeleteMapping("/{boardId}")
    public ResponseEntity<BoardResponse> delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable Long boardId
    ) {
        return ResponseEntity.ok(BoardResponse.from(boardApplicationService.delete(principal.id(), boardId)));
    }
}
