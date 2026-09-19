package taedonghee.plan_fix.interfaces.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import taedonghee.plan_fix.application.auth.PhoneRecoveryApplicationService;

@RestController
@RequestMapping("/api/v1/auth/phone")
@RequiredArgsConstructor
public class PhoneRecoveryController {
    private final PhoneRecoveryApplicationService service;

    @PostMapping("/request")
    public ResponseEntity<PhoneRecoveryApplicationService.Requested> request(@RequestBody Request request, HttpServletRequest http) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.request(request.purpose(), request.phoneNumber(), request.loginId(), http.getRemoteAddr()));
    }

    @PostMapping("/confirm")
    public ResponseEntity<PhoneRecoveryApplicationService.Confirmed> confirm(@RequestBody Confirm request, HttpServletRequest http) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.confirm(request.challengeId(), request.code(), http.getRemoteAddr()));
    }

    public record Request(String purpose, String phoneNumber, String loginId) {
        @Override public String toString() { return "PhoneRequest[redacted]"; }
    }
    public record Confirm(String challengeId, String code) {
        @Override public String toString() { return "PhoneConfirm[redacted]"; }
    }
}
