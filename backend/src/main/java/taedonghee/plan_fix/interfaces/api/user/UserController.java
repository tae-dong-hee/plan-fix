package taedonghee.plan_fix.interfaces.api.user;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import taedonghee.plan_fix.application.user.UserApplicationService;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;

/**
 * 사용자 API HTTP Controller
 */
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserApplicationService userApplicationService;

    /** 현재 로그인한 사용자 프로필 조회 API */
    @GetMapping("/me")
    public ResponseEntity<UserResponse> getMe(@AuthenticationPrincipal AuthenticatedUser principal) {
        return ResponseEntity.ok(UserResponse.from(userApplicationService.get(principal.id())));
    }

    @GetMapping("/username-availability")
    public ResponseEntity<UsernameAvailabilityResponse> usernameAvailability(@org.springframework.web.bind.annotation.RequestParam String username) {
        boolean available = userApplicationService.isUsernameAvailable(username);
        return ResponseEntity.ok(new UsernameAvailabilityResponse(available, available ? "사용 가능한 아이디입니다." : "이미 사용 중인 아이디입니다."));
    }

    @GetMapping("/email-availability")
    public ResponseEntity<EmailAvailabilityResponse> emailAvailability(@RequestParam String email) {
        boolean available = userApplicationService.isEmailAvailable(email);
        return ResponseEntity.ok(new EmailAvailabilityResponse(
                available, available ? "사용 가능한 이메일입니다." : "이미 가입된 이메일입니다."));
    }

    /** 현재 로그인한 사용자 프로필 수정 API */
    @PatchMapping("/me")
    public ResponseEntity<UserResponse> updateMe(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestBody UserRequest.Update request
    ) {
        return ResponseEntity.ok(UserResponse.from(userApplicationService.update(principal.id(), request.toCommand())));
    }

    /**
     * 사용자 생성 API
     */
    @PostMapping
    public ResponseEntity<UserResponse> create(@RequestBody UserRequest.Create request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(UserResponse.from(userApplicationService.create(request.toCommand())));
    }

    /**
     * 사용자 단건 조회 API
     */
    @GetMapping("/{userId}")
    public ResponseEntity<UserResponse> get(@PathVariable Long userId) {
        return ResponseEntity.ok(UserResponse.from(userApplicationService.get(userId)));
    }

    /**
     * 사용자 전체 조회 API
     */
    @GetMapping
    public ResponseEntity<List<UserResponse>> getAll() {
        List<UserResponse> responses = userApplicationService.getAll().stream()
                .map(UserResponse::from)
                .toList();
        return ResponseEntity.ok(responses);
    }

    /**
     * 사용자 프로필 수정 API
     */
    @PatchMapping("/{userId}")
    public ResponseEntity<UserResponse> update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable Long userId,
            @RequestBody UserRequest.Update request
    ) {
        requireOwner(principal, userId);
        return ResponseEntity.ok(UserResponse.from(userApplicationService.update(userId, request.toCommand())));
    }

    /**
     * 사용자 탈퇴 API
     */
    @DeleteMapping("/{userId}")
    public ResponseEntity<UserResponse> withdraw(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable Long userId
    ) {
        requireOwner(principal, userId);
        return ResponseEntity.ok(UserResponse.from(userApplicationService.withdraw(userId)));
    }

    private static void requireOwner(AuthenticatedUser principal, Long userId) {
        if (principal == null || principal.id() == null || !principal.id().equals(userId)) {
            throw new CoreException(ErrorType.FORBIDDEN, "본인 계정만 수정하거나 탈퇴할 수 있습니다.");
        }
    }

    public record UsernameAvailabilityResponse(boolean available, String message) { }
    public record EmailAvailabilityResponse(boolean available, String message) { }
}
