package taedonghee.plan_fix.interfaces.api.user;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import taedonghee.plan_fix.application.auth.PhoneRecoveryApplicationService;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;

@RestController
@RequestMapping("/api/v1/users/me/recovery-phone")
@RequiredArgsConstructor
public class RecoveryPhoneController {
    private final PhoneRecoveryApplicationService service;

    @GetMapping
    public ResponseEntity<PhoneRecoveryApplicationService.BoundPhone> get(@AuthenticationPrincipal AuthenticatedUser principal) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.getBoundPhone(principal.id()));
    }

    @PostMapping("/request")
    public ResponseEntity<PhoneRecoveryApplicationService.Requested> request(@AuthenticationPrincipal AuthenticatedUser principal,
                                                                          @RequestBody Request request, HttpServletRequest http) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.requestBinding(principal.id(), request.phoneNumber(), request.password(), http.getRemoteAddr()));
    }

    @PostMapping("/confirm")
    public ResponseEntity<PhoneRecoveryApplicationService.BoundPhone> confirm(@AuthenticationPrincipal AuthenticatedUser principal,
                                                                          @RequestBody Confirm request, HttpServletRequest http) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.confirmBinding(principal.id(), request.challengeId(), request.code(), http.getRemoteAddr()));
    }

    public record Request(String phoneNumber, String password) {
        @Override public String toString() { return "RecoveryPhoneRequest[redacted]"; }
    }
    public record Confirm(String challengeId, String code) {
        @Override public String toString() { return "RecoveryPhoneConfirm[redacted]"; }
    }
}
