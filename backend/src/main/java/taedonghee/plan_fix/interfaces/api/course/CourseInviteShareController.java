package taedonghee.plan_fix.interfaces.api.course;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import taedonghee.plan_fix.application.course.CourseInviteShareService;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class CourseInviteShareController {
    private final CourseInviteShareService shares;

    @GetMapping("/api/v1/course-invites/{token}/kakao-shares/{requestId}")
    public ResponseEntity<CourseInviteShareService.ShareStatus> status(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable String token, @PathVariable UUID requestId) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(shares.status(principal.id(), token, requestId));
    }

    // Register this URL with method POST in Kakao Developers > Webhooks.
    @PostMapping("/api/v1/webhooks/kakao/share")
    public ResponseEntity<Void> delivered(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody Map<String, String> payload) {
        String token = payload.get("invite_token");
        String requestId = payload.get("share_request_id");
        if (token == null || token.isBlank() || token.length() > 64 || requestId == null
                || !requestId.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw new CoreException(ErrorType.BAD_REQUEST);
        }
        shares.delivered(authorization, token, UUID.fromString(requestId));
        return ResponseEntity.noContent().build();
    }
}
