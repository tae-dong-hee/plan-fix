package taedonghee.plan_fix.application.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.user.PasswordEncryptor;
import taedonghee.plan_fix.domain.user.UserCredentialModel;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.infrastructure.auth.PasswordResetJpaEntity;
import taedonghee.plan_fix.infrastructure.auth.PasswordResetJpaRepository;
import taedonghee.plan_fix.infrastructure.auth.PasswordResetMailSender;
import taedonghee.plan_fix.infrastructure.user.UserCredentialJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class PasswordResetApplicationService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern TOKEN_PATTERN = Pattern.compile("[A-Za-z0-9_-]{43}");

    private final UserCredentialJpaRepository credentials;
    private final PasswordResetJpaRepository resets;
    private final PasswordEncryptor passwordEncryptor;
    private final PasswordResetMailSender mailSender;
    private final ApplicationEventPublisher events;

    @Transactional
    public PasswordResetMail request(String loginId, String email) {
        if (loginId == null || email == null || loginId.length() > 20 || email.length() > 255) {
            throw new CoreException(ErrorType.RECOVERY_ACCOUNT_MISMATCH);
        }
        var credential = credentials.findByLoginIdForUpdate(loginId.trim()).orElse(null);
        if (credential == null) {
            throw new CoreException(ErrorType.RECOVERY_ACCOUNT_MISMATCH);
        }
        var user = credential.getUser();
        if (user.getStatus() != UserStatus.ACTIVE || user.getEmail() == null
                || !user.getEmail().equalsIgnoreCase(email.trim())) {
            throw new CoreException(ErrorType.RECOVERY_ACCOUNT_MISMATCH);
        }
        mailSender.requireAvailable();

        Instant now = Instant.now();
        var reset = resets.findById(user.getId()).orElseGet(() -> new PasswordResetJpaEntity(user.getId()));
        if (reset.isCoolingDown(now)) {
            throw new CoreException(ErrorType.TOO_MANY_REQUESTS, "재설정 메일은 60초 후 다시 요청해 주세요.");
        }
        String token = issue(reset, now);
        // The synchronous AFTER_COMMIT listener records SMTP acceptance. The HTTP
        // controller checks that result after commit instead of claiming success on failure.
        var delivery = new PasswordResetMail(user.getEmail(), token);
        events.publishEvent(delivery);
        return delivery;
    }

    private String issue(PasswordResetJpaEntity reset, Instant now) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        reset.issue(hash(token), now);
        resets.save(reset);
        return token;
    }

    @Transactional
    public void confirm(String token, String password) {
        if (token == null || !TOKEN_PATTERN.matcher(token).matches()) {
            throw invalidToken();
        }
        String hash = hash(token);
        Long userId = resets.findUserIdByTokenHash(hash).orElseThrow(PasswordResetApplicationService::invalidToken);
        // Every request, confirmation and login locks this same row. A second
        // concurrent confirmation observes the consumed token after acquiring it.
        var credential = credentials.findByUserIdForUpdate(userId)
                .orElseThrow(PasswordResetApplicationService::invalidToken);
        var reset = resets.findById(userId).orElseThrow(PasswordResetApplicationService::invalidToken);
        if (credential.getUser().getStatus() != UserStatus.ACTIVE || !reset.accepts(hash, Instant.now())) {
            throw invalidToken();
        }
        UserCredentialModel.validateRawPassword(password);
        credential.changePassword(passwordEncryptor.encrypt(password));
        reset.consume();
        // Managed credential + reset entities are flushed together on commit.
    }

    private static CoreException invalidToken() {
        return new CoreException(ErrorType.INVALID_PASSWORD_RESET_TOKEN);
    }

    private static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
