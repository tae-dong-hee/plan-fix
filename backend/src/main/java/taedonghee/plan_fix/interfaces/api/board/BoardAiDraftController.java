package taedonghee.plan_fix.interfaces.api.board;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import taedonghee.plan_fix.application.board.BoardAiDraftApplicationService;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;

@RestController
@RequestMapping("/api/v1/boards")
@RequiredArgsConstructor
public class BoardAiDraftController {
    private final BoardAiDraftApplicationService drafts;

    /** Generates an editable draft only; photos and posts are never stored here. */
    @PostMapping(value = "/ai-draft", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<DraftResponse> generate(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam(required = false) String title,
            @RequestParam(required = false) String note,
            @RequestParam(required = false) Long courseId,
            @RequestParam(required = false) List<Long> visitedSpotIds) {
        if (principal == null) throw new CoreException(ErrorType.UNAUTHORIZED);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new DraftResponse(drafts.generate(principal.id(), files, title, note, courseId, visitedSpotIds)));
    }

    public record DraftResponse(String content) { }
}
