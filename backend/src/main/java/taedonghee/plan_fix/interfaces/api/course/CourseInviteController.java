package taedonghee.plan_fix.interfaces.api.course;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import taedonghee.plan_fix.application.course.CourseInviteApplicationService;
import taedonghee.plan_fix.infrastructure.course.CourseMemberRole;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;

import java.util.List;

/** 카카오톡에 공유할 코스 초대 링크의 생성·미리보기·수락 API. */
@RestController
@RequiredArgsConstructor
public class CourseInviteController {
    private final CourseInviteApplicationService inviteService;
    @Value("${app.frontend-base-url}") private String frontendBaseUrl;

    @PostMapping("/api/v1/courses/{courseId}/invites")
    public ResponseEntity<CourseInviteApplicationService.CourseInviteResult> create(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable Long courseId,
            @RequestBody CreateInviteRequest request) {
        return ResponseEntity.ok(inviteService.createInvite(principal.id(), courseId, request.memberRole(), frontendBaseUrl));
    }

    /** 로그인 전에도 초대 대상 코스와 권한을 확인할 수 있어 회원가입 화면을 구성할 수 있다. */
    @GetMapping("/api/v1/course-invites/{token}")
    public ResponseEntity<CourseInviteApplicationService.CourseInvitePreview> preview(@PathVariable String token) {
        return ResponseEntity.ok(inviteService.preview(token));
    }

    /** 인증되지 않은 요청은 SecurityConfig가 401을 반환한다. 프론트는 가입/로그인 후 재시도한다. */
    @PostMapping("/api/v1/course-invites/{token}/accept")
    public ResponseEntity<CourseInviteApplicationService.CourseInviteAcceptResult> accept(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable String token) {
        return ResponseEntity.ok(inviteService.accept(principal.id(), token));
    }

    @GetMapping("/api/v1/courses/{courseId}/members")
    public ResponseEntity<List<CourseInviteApplicationService.CourseMemberResult>> members(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable Long courseId) {
        return ResponseEntity.ok(inviteService.members(principal.id(), courseId));
    }


    @DeleteMapping("/api/v1/courses/{courseId}/members/{memberUserId}")
    public ResponseEntity<Void> remove(@AuthenticationPrincipal AuthenticatedUser principal, @PathVariable Long courseId,
                                       @PathVariable Long memberUserId) {
        inviteService.removeMember(principal.id(), courseId, memberUserId);
        return ResponseEntity.noContent().build();
    }
    @GetMapping("/api/v1/courses/{courseId}/invites")
    public ResponseEntity<List<CourseInviteApplicationService.PendingInviteResult>> pending(@AuthenticationPrincipal AuthenticatedUser principal, @PathVariable Long courseId) { return ResponseEntity.ok(inviteService.pendingInvites(principal.id(), courseId)); }

    @GetMapping("/api/v1/courses/{courseId}/invite-groups")
    public ResponseEntity<List<CourseInviteApplicationService.InviteGroupResult>> groups(
            @AuthenticationPrincipal AuthenticatedUser principal, @PathVariable Long courseId) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(inviteService.inviteGroups(principal.id(), courseId));
    }

    @DeleteMapping("/api/v1/courses/{courseId}/invite-groups/{role}")
    public ResponseEntity<Void> cancelGroup(@AuthenticationPrincipal AuthenticatedUser principal,
                                           @PathVariable Long courseId, @PathVariable CourseMemberRole role) {
        inviteService.cancelInviteGroup(principal.id(), courseId, role);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/api/v1/courses/{courseId}/members/{memberUserId}")
    public ResponseEntity<Void> updateRole(@AuthenticationPrincipal AuthenticatedUser principal, @PathVariable Long courseId, @PathVariable Long memberUserId, @RequestBody UpdateRoleRequest request) {
        inviteService.updateMemberRole(principal.id(), courseId, memberUserId, request.role()); return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/api/v1/courses/{courseId}/invites/{token}")
    public ResponseEntity<Void> cancelInvite(@AuthenticationPrincipal AuthenticatedUser principal, @PathVariable Long courseId, @PathVariable String token) {
        inviteService.cancelInvite(principal.id(), courseId, token); return ResponseEntity.noContent().build();
    }

    public record CreateInviteRequest(CourseMemberRole memberRole) { }
    public record UpdateRoleRequest(CourseMemberRole role) { }
}
