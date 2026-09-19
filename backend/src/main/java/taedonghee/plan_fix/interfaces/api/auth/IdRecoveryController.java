package taedonghee.plan_fix.interfaces.api.auth;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import taedonghee.plan_fix.application.auth.IdRecoveryApplicationService;
import taedonghee.plan_fix.application.auth.RecoveryRequestLimiter;

@RestController
@RequestMapping("/api/v1/auth/id-recovery")
@RequiredArgsConstructor
public class IdRecoveryController {
    private final IdRecoveryApplicationService service;
    private final RecoveryRequestLimiter requests;

    @PostMapping("/request")
    public ResponseEntity<Void> request(@RequestBody Request request, HttpServletRequest http) {
        requests.acquireRequest(http.getRemoteAddr());
        service.request(request.email()).requireAccepted();
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }

    public record Request(String email) {
        @Override public String toString() { return "IdRecoveryRequest[redacted]"; }
    }
}
