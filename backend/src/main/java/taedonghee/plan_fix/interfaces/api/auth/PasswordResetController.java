package taedonghee.plan_fix.interfaces.api.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import taedonghee.plan_fix.application.auth.PasswordResetApplicationService;
import taedonghee.plan_fix.infrastructure.security.CookieFactory;

@RestController
@RequestMapping("/api/v1/auth/password-reset")
@RequiredArgsConstructor
public class PasswordResetController {
    private final PasswordResetApplicationService service;
    private final CookieFactory cookieFactory;

    @PostMapping("/request")
    public ResponseEntity<Void> request(@RequestBody Request request) {
        service.request(request.loginId(), request.email());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    @PostMapping("/confirm")
    public ResponseEntity<Void> confirm(@RequestBody Confirm request) {
        service.confirm(request.token(), request.password());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookieFactory.expiredAccessToken().toString()).build();
    }

    public record Request(String loginId, String email) { }
    public record Confirm(String token, String password) { }
}
