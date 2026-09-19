package taedonghee.plan_fix.application.auth;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * A shared socket-peer abuse ceiling, not an individual client's IP quota.
 * Multiple users can share the same peer behind Cloud Run or another proxy.
 * Per-phone cooldowns/quotas and per-challenge attempt limits remain mandatory.
 */
@Component
public class RecoveryRequestLimiter {
    private final PhoneVerificationRateLimiter limits;
    private final int requestHourlyLimit;
    private final int confirmationHourlyLimit;

    public RecoveryRequestLimiter(PhoneVerificationRateLimiter limits,
            @Value("${app.account-recovery.request-hourly-limit:1000}") int requestHourlyLimit,
            @Value("${app.account-recovery.confirmation-hourly-limit:3000}") int confirmationHourlyLimit) {
        if (requestHourlyLimit <= 0 || confirmationHourlyLimit <= 0) {
            throw new IllegalArgumentException("Account recovery request ceilings must be positive");
        }
        this.limits = limits;
        this.requestHourlyLimit = requestHourlyLimit;
        this.confirmationHourlyLimit = confirmationHourlyLimit;
    }

    /** Call outside the account/challenge transaction; quota commits independently. */
    public void acquireRequest(String socketPeer) {
        limits.acquire("recovery-request-peer", peer(socketPeer), requestHourlyLimit, 0);
    }

    /** Call outside the account/challenge transaction; quota commits independently. */
    public void acquireConfirmation(String socketPeer) {
        limits.acquire("recovery-confirmation-peer", peer(socketPeer), confirmationHourlyLimit, 0);
    }

    private static String peer(String socketPeer) {
        // Callers pass HttpServletRequest.getRemoteAddr(), never an arbitrary forwarded header.
        return socketPeer == null || socketPeer.isBlank() ? "unknown" : socketPeer;
    }
}
