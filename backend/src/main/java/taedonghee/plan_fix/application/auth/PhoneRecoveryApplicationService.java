package taedonghee.plan_fix.application.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import taedonghee.plan_fix.domain.user.PasswordEncryptor;
import taedonghee.plan_fix.domain.user.RecoveryPhone;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.infrastructure.auth.*;
import taedonghee.plan_fix.infrastructure.auth.PhoneChallengeJpaEntity.Purpose;
import taedonghee.plan_fix.infrastructure.user.UserCredentialJpaEntity;
import taedonghee.plan_fix.infrastructure.user.UserCredentialJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.Instant;
import java.util.Objects;
import java.util.function.Supplier;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class PhoneRecoveryApplicationService {
    private static final Pattern TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private final PhoneChallengeJpaRepository challenges;
    private final UserRecoveryPhoneJpaRepository phones;
    private final UserCredentialJpaRepository credentials;
    private final PasswordEncryptor passwords;
    private final PasswordResetApplicationService passwordResets;
    private final SmsVerificationSender sms;
    private final PhoneVerificationCrypto crypto;
    private final PhoneVerificationRateLimiter limits;
    private final RecoveryRequestLimiter requestLimits;
    private final PhoneRateLimitJpaRepository phoneLocks;
    private final PlatformTransactionManager transactionManager;

    public Requested request(String purposeValue, String rawPhone, String loginId, String remoteAddress) {
        requestLimits.acquireRequest(remoteAddress);
        Purpose purpose = publicPurpose(purposeValue);
        String phone = RecoveryPhone.normalize(rawPhone);
        sms.requireAvailable();
        limits.acquire("phone", phone, 5, 60);
        return transaction(() -> requestInTransaction(purpose, phone, loginId));
    }

    private Requested requestInTransaction(Purpose purpose, String phone, String loginId) {
        Long userId = null;
        if (purpose == Purpose.SIGNUP) {
            ensurePhoneAvailable(phone, null);
        } else {
            userId = phones.findUserIdByPhoneNumber(phone).orElseThrow(PhoneRecoveryApplicationService::accountMismatch);
            var credential = activeCredential(userId);
            if (!phones.findById(userId).orElseThrow(PhoneRecoveryApplicationService::accountMismatch)
                    .getPhoneNumber().equals(phone)) throw accountMismatch();
            if (purpose == Purpose.RESET_PASSWORD && (loginId == null || loginId.length() > 20
                    || !credential.getLoginId().equals(loginId.trim()))) throw accountMismatch();
        }
        return issue(purpose, phone, userId);
    }

    public Confirmed confirm(String challengeId, String code, String remoteAddress) {
        requestLimits.acquireConfirmation(remoteAddress);
        return commitAttempts(() -> confirmInTransaction(challengeId, code));
    }

    private Confirmed confirmInTransaction(String challengeId, String code) {
        // Requests, confirmations and binding all acquire credential before challenge.
        // Read only the scalar here to avoid a stale managed entity after waiting.
        if (challengeId != null && TOKEN.matcher(challengeId).matches()) {
            challenges.findUserId(challengeId).ifPresent(this::activeCredential);
        }
        var challenge = challenge(challengeId);
        if (challenge.getPurpose() == Purpose.BIND) throw invalidCode();
        verifyCode(challenge, code);
        if (challenge.getPurpose() == Purpose.SIGNUP) {
            ensurePhoneAvailable(challenge.getPhoneNumber(), null);
            String token = crypto.token();
            challenge.verifySignup(crypto.hash("signup-receipt", token), Instant.now());
            return new Confirmed("SIGNUP", token, null, null);
        }
        var credential = activeCredential(challenge.getUserId());
        assertCurrentPhone(challenge);
        String token = passwordResets.issueForVerifiedUser(credential.getUser().getId());
        challenge.consume();
        return new Confirmed(challenge.getPurpose().name(), null,
                challenge.getPurpose() == Purpose.FIND_ID ? credential.getLoginId() : null, token);
    }

    @Transactional(readOnly = true)
    public BoundPhone getBoundPhone(Long userId) {
        return new BoundPhone(phones.findById(userId).map(phone -> RecoveryPhone.mask(phone.getPhoneNumber())).orElse(null));
    }

    public Requested requestBinding(Long userId, String rawPhone, String password, String remoteAddress) {
        requestLimits.acquireRequest(remoteAddress);
        limits.acquire("bind-user", String.valueOf(userId), 10, 0);
        String phone = RecoveryPhone.normalize(rawPhone);
        sms.requireAvailable();
        // Reserve all independent quota transactions before taking account locks.
        limits.acquire("phone", phone, 5, 60);
        return transaction(() -> requestBindingInTransaction(userId, phone, password));
    }

    private Requested requestBindingInTransaction(Long userId, String phone, String password) {
        var credential = activeCredential(userId);
        if (password == null || password.length() > 72 || !passwords.matches(password, credential.getPassword())) {
            throw new CoreException(ErrorType.BAD_REQUEST, "현재 비밀번호가 일치하지 않습니다.");
        }
        ensurePhoneAvailable(phone, userId);
        return issue(Purpose.BIND, phone, userId);
    }

    public BoundPhone confirmBinding(Long userId, String challengeId, String code, String remoteAddress) {
        requestLimits.acquireConfirmation(remoteAddress);
        return commitAttempts(() -> confirmBindingInTransaction(userId, challengeId, code));
    }

    private BoundPhone confirmBindingInTransaction(Long userId, String challengeId, String code) {
        activeCredential(userId);
        var challenge = challenge(challengeId);
        if (challenge.getPurpose() != Purpose.BIND || !Objects.equals(challenge.getUserId(), userId)) throw invalidCode();
        verifyCode(challenge, code);
        bind(userId, challenge.getPhoneNumber());
        challenge.consume();
        return new BoundPhone(RecoveryPhone.mask(challenge.getPhoneNumber()));
    }

    private <T> T transaction(Supplier<T> action) {
        return new TransactionTemplate(transactionManager).execute(status -> action.get());
    }

    /** Commit only an incorrect-code counter before propagating its HTTP error. */
    private <T> T commitAttempts(Supplier<T> action) {
        Attempt<T> attempt = transaction(() -> {
            try {
                return new Attempt<>(action.get(), null);
            } catch (RejectedCode rejection) {
                return new Attempt<>(null, rejection);
            }
        });
        if (attempt.rejection() != null) throw attempt.rejection();
        return attempt.result();
    }

    private record Attempt<T>(T result, RejectedCode rejection) { }

    /** Joins signup's transaction; a failed signup cannot consume proof or attach a phone. */
    @Transactional
    public void bindSignupProof(Long userId, String token) {
        if (token == null) return;
        if (!TOKEN.matcher(token).matches()) throw invalidReceipt();
        var challenge = challenges.findReceiptForUpdate(crypto.hash("signup-receipt", token))
                .orElseThrow(PhoneRecoveryApplicationService::invalidReceipt);
        if (!challenge.acceptsReceipt(Instant.now())) throw invalidReceipt();
        activeCredential(userId);
        bind(userId, challenge.getPhoneNumber());
        challenge.consume();
    }

    private Requested issue(Purpose purpose, String phone, Long userId) {
        String id = crypto.token();
        String code = crypto.code();
        challenges.invalidatePending(phone);
        var challenge = new PhoneChallengeJpaEntity(id, purpose, phone, userId,
                codeHash(id, purpose, phone, userId, code), Instant.now());
        challenges.saveAndFlush(challenge);
        // Synchronous delivery in this transaction: failure rolls back the challenge,
        // while the separately committed rate limit still prevents repeated abuse.
        sms.send(phone, code);
        return new Requested(id, 300, 60);
    }

    private PhoneChallengeJpaEntity challenge(String id) {
        if (id == null || !TOKEN.matcher(id).matches()) throw invalidCode();
        return challenges.findForUpdate(id).orElseThrow(PhoneRecoveryApplicationService::invalidCode);
    }

    private void verifyCode(PhoneChallengeJpaEntity challenge, String code) {
        if (challenge.isConsumed() || challenge.isVerified() || !Instant.now().isBefore(challenge.getExpiresAt())) {
            throw new CoreException(ErrorType.PHONE_CODE_EXPIRED);
        }
        if (challenge.getAttempts() >= 5) throw new CoreException(ErrorType.PHONE_ATTEMPTS_EXCEEDED);
        if (code == null || !code.matches("[0-9]{6}") || !crypto.matches(challenge.getCodeHash(),
                codeHash(challenge.getId(), challenge.getPurpose(), challenge.getPhoneNumber(), challenge.getUserId(), code))) {
            challenge.failedAttempt();
            throw new RejectedCode(challenge.getAttempts() >= 5);
        }
    }

    private String codeHash(String id, Purpose purpose, String phone, Long userId, String code) {
        return crypto.hash("otp", id + ":" + purpose + ":" + phone + ":" + userId + ":" + code);
    }

    private UserCredentialJpaEntity activeCredential(Long userId) {
        var credential = credentials.findByUserIdForUpdate(userId).orElseThrow(PhoneRecoveryApplicationService::accountMismatch);
        if (credential.getUser().getStatus() != UserStatus.ACTIVE) throw accountMismatch();
        return credential;
    }

    private void assertCurrentPhone(PhoneChallengeJpaEntity challenge) {
        var current = phones.findById(challenge.getUserId()).orElseThrow(PhoneRecoveryApplicationService::accountMismatch);
        if (!current.getPhoneNumber().equals(challenge.getPhoneNumber())) throw accountMismatch();
    }

    private void ensurePhoneAvailable(String phone, Long userId) {
        phones.findByPhoneNumber(phone).ifPresent(existing -> {
            if (!Objects.equals(existing.getUserId(), userId)) throw phoneAlreadyRegistered();
        });
    }

    private void bind(Long userId, String phone) {
        // Every proof has a quota row. Lock it as the phone's binding mutex before
        // checking ownership, so concurrent signups reject cleanly without a SQL
        // uniqueness error whose driver diagnostic could include the phone number.
        if (phoneLocks.findForUpdate(crypto.hash("rate-phone", phone)) == null) throw invalidReceipt();
        ensurePhoneAvailable(phone, userId);
        var registered = phones.findById(userId).orElseGet(() -> new UserRecoveryPhoneJpaEntity(userId, phone));
        registered.change(phone);
        try {
            // Database uniqueness also protects two concurrent, verified signups.
            phones.saveAndFlush(registered);
        } catch (DataIntegrityViolationException conflict) {
            throw phoneAlreadyRegistered();
        }
    }

    private static Purpose publicPurpose(String raw) {
        try {
            Purpose purpose = Purpose.valueOf(raw == null ? "" : raw);
            if (purpose != Purpose.BIND) return purpose;
        } catch (IllegalArgumentException ignored) { }
        throw new CoreException(ErrorType.BAD_REQUEST, "올바른 휴대폰 인증 요청이 아닙니다.");
    }

    private static CoreException accountMismatch() {
        return new CoreException(ErrorType.BAD_REQUEST, "아이디 또는 등록된 휴대폰번호가 일치하지 않습니다. 휴대폰 인증을 등록한 계정인지 확인해 주세요.");
    }

    private static CoreException phoneAlreadyRegistered() {
        return new CoreException(ErrorType.CONFLICT, "이미 다른 계정에 등록된 휴대폰번호입니다.");
    }

    private static CoreException invalidCode() {
        return new CoreException(ErrorType.BAD_REQUEST, "인증번호가 일치하지 않거나 만료되었습니다. 다시 요청해 주세요.");
    }

    private static CoreException invalidReceipt() {
        return new CoreException(ErrorType.BAD_REQUEST, "휴대폰 인증이 만료되었거나 이미 사용되었습니다. 다시 인증해 주세요.");
    }

    private static final class RejectedCode extends CoreException {
        private RejectedCode(boolean exhausted) {
            super(exhausted ? ErrorType.PHONE_ATTEMPTS_EXCEEDED : ErrorType.BAD_REQUEST,
                    exhausted ? null : "인증번호가 일치하지 않습니다. 5회 오류 시 다시 요청해 주세요.");
        }
    }

    public record Requested(String challengeId, int expiresIn, int resendAfter) {
        @Override public String toString() { return "PhoneRequested[redacted]"; }
    }
    public record Confirmed(String purpose, String verificationToken, String loginId, String passwordResetToken) {
        @Override public String toString() { return "PhoneConfirmed[redacted]"; }
    }
    public record BoundPhone(String phoneNumber) {
        @Override public String toString() { return "BoundPhone[redacted]"; }
    }
}
