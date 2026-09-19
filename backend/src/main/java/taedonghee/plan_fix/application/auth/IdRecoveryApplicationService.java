package taedonghee.plan_fix.application.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.infrastructure.auth.PasswordResetMailSender;
import taedonghee.plan_fix.infrastructure.user.UserCredentialJpaEntity;
import taedonghee.plan_fix.infrastructure.user.UserCredentialJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class IdRecoveryApplicationService {
    private final UserCredentialJpaRepository credentials;
    private final PasswordResetMailSender mailSender;
    private final RecoveryRateLimiter limits;
    private final ApplicationEventPublisher events;
    private final PlatformTransactionManager transactions;

    public IdRecoveryMail request(String rawEmail) {
        String email = normalizedEmail(rawEmail);
        // Quota commits before opening the account transaction: transport errors
        // retain the limit and concurrent requests cannot exhaust a nested pool.
        limits.acquire("id-recovery-email", email, 5, 60);
        return new TransactionTemplate(transactions).execute(status -> {
            var accounts = credentials.findActiveByEmailForUpdate(email);
            if (accounts.isEmpty()) throw mismatch();
            // The domain is case-insensitive, but a legacy mail host can distinguish
            // local-part casing. Never combine IDs belonging to distinct stored
            // local parts into a message addressed to whichever row happens first.
            if (accounts.stream().map(account -> localPart(account.getUser().getEmail())).distinct().count() > 1) {
                String requestedLocalPart = localPart(rawEmail.trim());
                accounts = accounts.stream().filter(account -> localPart(account.getUser().getEmail()).equals(requestedLocalPart)).toList();
                if (accounts.isEmpty()) throw mismatch();
            }
            mailSender.requireAvailable();
            var delivery = new IdRecoveryMail(accounts.getFirst().getUser().getEmail(),
                    accounts.stream().map(UserCredentialJpaEntity::getLoginId).toList());
            events.publishEvent(delivery);
            return delivery;
        });
    }

    private static String normalizedEmail(String raw) {
        if (raw == null || raw.length() > 255) throw mismatch();
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        try {
            UserModel.validateEmail(normalized);
        } catch (CoreException invalid) {
            throw mismatch();
        }
        return normalized;
    }

    private static CoreException mismatch() { return new CoreException(ErrorType.RECOVERY_EMAIL_MISMATCH); }

    private static String localPart(String email) { return email.substring(0, email.indexOf('@')); }
}
