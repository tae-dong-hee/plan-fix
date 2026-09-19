package taedonghee.plan_fix.interfaces.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import taedonghee.plan_fix.application.auth.PasswordResetApplicationService;
import taedonghee.plan_fix.application.auth.RecoveryRateLimiter;
import taedonghee.plan_fix.application.auth.RecoveryRequestLimiter;
import taedonghee.plan_fix.infrastructure.security.CookieFactory;

@RestController
@RequestMapping("/api/v1/auth/password-reset")
@RequiredArgsConstructor
public class PasswordResetController {
    private final PasswordResetApplicationService service;
    private final CookieFactory cookieFactory;
    private final RecoveryRateLimiter rateLimiter;
    private final RecoveryRequestLimiter requestLimiter;

    @PostMapping("/request")
    public ResponseEntity<Void> request(@RequestBody Request request, HttpServletRequest http) {
        requestLimiter.acquireRequest(http.getRemoteAddr());
        if (request.loginId() != null && request.loginId().length() <= 20) {
            rateLimiter.acquire("email-login", request.loginId().trim(), 20, 0);
        }
        service.request(request.loginId(), request.email()).requireAccepted();
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/confirm")
    public ResponseEntity<Void> confirm(@RequestBody Confirm request, HttpServletRequest http) {
        requestLimiter.acquireConfirmation(http.getRemoteAddr());
        service.confirm(request.token(), request.password());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookieFactory.expiredAccessToken().toString()).build();
    }

    public record Request(String loginId, String email) {
        @Override public String toString() { return "PasswordResetRequest[redacted]"; }
    }
    public record Confirm(String token, String password) {
        @Override public String toString() { return "PasswordResetConfirm[redacted]"; }
    }
}
