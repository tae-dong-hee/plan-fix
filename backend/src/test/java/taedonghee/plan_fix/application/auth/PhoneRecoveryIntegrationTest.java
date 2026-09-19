package taedonghee.plan_fix.application.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import taedonghee.plan_fix.application.user.UserApplicationService;
import taedonghee.plan_fix.application.user.UserCommand;
import taedonghee.plan_fix.domain.user.*;
import taedonghee.plan_fix.infrastructure.auth.*;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.user.UserCredentialJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** Real PostgreSQL transactions; the transport mock never sends an external SMS. */
@SpringBootTest(properties = {
        "security.jwt.secret=phone-recovery-test-key-with-sufficient-entropy-for-testing",
        "spring.datasource.hikari.maximum-pool-size=3", "spring.datasource.hikari.connection-timeout=3000",
        "app.account-recovery.request-hourly-limit=20", "app.account-recovery.confirmation-hourly-limit=60"
})
@ActiveProfiles("test")
class PhoneRecoveryIntegrationTest {
    @Autowired PhoneRecoveryApplicationService service;
    @Autowired UserApplicationService signup;
    @Autowired PasswordResetApplicationService resets;
    @Autowired AuthApplicationService auth;
    @Autowired UserRepository users;
    @Autowired UserCredentialRepository credentials;
    @Autowired UserCredentialJpaRepository credentialEntities;
    @Autowired PhoneChallengeJpaRepository challenges;
    @Autowired UserRecoveryPhoneJpaRepository phones;
    @Autowired PasswordResetJpaRepository resetTokens;
    @Autowired PasswordEncryptor passwords;
    @Autowired JwtTokenProvider sessions;
    @Autowired PhoneVerificationCrypto crypto;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoBean SmsVerificationSender sms;

    private String phone;
    private String ip;
    private String loginId;
    private UserModel user;
    private Map<String, String> sentCodes;

    @BeforeEach
    void setup() {
        phone = newPhone();
        ip = "test-peer-" + UUID.randomUUID();
        loginId = newLogin();
        user = account(loginId);
        sentCodes = new ConcurrentHashMap<>();
        doAnswer(call -> { sentCodes.put(call.getArgument(0), call.getArgument(1)); return null; })
                .when(sms).send(anyString(), anyString());
    }

    @Test
    void verifiedSignupFindsIdAndResetsPasswordAndRevokesSessions() {
        String newLogin = newLogin();
        var request = service.request("SIGNUP", "+82 10-" + phone.substring(3, 7) + "-" + phone.substring(7), null, ip);
        assertThat(request.expiresIn()).isEqualTo(300);
        assertThat(request.resendAfter()).isEqualTo(60);
        String code = sentCodes.get(phone);
        assertThat(code).matches("[0-9]{6}");
        var stored = challenges.findById(request.challengeId()).orElseThrow();
        assertThat(stored.getCodeHash()).matches("[a-f0-9]{64}").isNotEqualTo(code);
        var verified = service.confirm(request.challengeId(), code, ip);
        assertThat(verified.purpose()).isEqualTo("SIGNUP");
        assertThat(verified.loginId()).isNull();
        assertThat(verified.passwordResetToken()).isNull();
        assertThat(verified.verificationToken()).matches("[A-Za-z0-9_-]{43}");
        var created = signup.create(new UserCommand.Create(null, null, newLogin + "@example.com", newLogin,
                "Oldpass123", null, verified.verificationToken()));
        assertThat(phones.findById(created.userId()).orElseThrow().getPhoneNumber()).isEqualTo(phone);
        assertThat(service.getBoundPhone(created.userId()).phoneNumber()).isEqualTo("010-****-" + phone.substring(7));
        String previousSession = auth.login(new AuthCommand.Login(newLogin, "Oldpass123")).accessToken();

        allowResend(phone);
        var recovery = service.request("FIND_ID", phone, null, ip);
        var found = service.confirm(recovery.challengeId(), sentCodes.get(phone), ip);
        assertThat(found.loginId()).isEqualTo(newLogin);
        assertThat(found.verificationToken()).isNull();
        assertThat(found.passwordResetToken()).matches("[A-Za-z0-9_-]{43}");
        resets.confirm(found.passwordResetToken(), "Newpass456");
        assertThat(sessions.parse(previousSession)).isEmpty();
        assertThatThrownBy(() -> auth.login(new AuthCommand.Login(newLogin, "Oldpass123"))).isInstanceOf(CoreException.class);
        assertThat(auth.login(new AuthCommand.Login(newLogin, "Newpass456")).accessToken()).isNotBlank();
        assertError(() -> resets.confirm(found.passwordResetToken(), "Another789"), ErrorType.INVALID_PASSWORD_RESET_TOKEN);
        assertError(() -> service.confirm(recovery.challengeId(), sentCodes.get(phone), ip), ErrorType.PHONE_CODE_EXPIRED);
    }

    @Test
    void existingAccountBindsOnlyAfterCurrentPasswordAndOtpThenResetsByPhone() {
        assertThat(service.getBoundPhone(user.getUserId()).phoneNumber()).isNull();
        var request = service.requestBinding(user.getUserId(), phone, "Oldpass123", ip);
        assertThat(phones.findById(user.getUserId())).isEmpty();
        var bound = service.confirmBinding(user.getUserId(), request.challengeId(), sentCodes.get(phone), ip);
        assertThat(bound.phoneNumber()).isEqualTo("010-****-" + phone.substring(7));

        allowResend(phone);
        var recovery = service.request("RESET_PASSWORD", phone, loginId, ip);
        var result = service.confirm(recovery.challengeId(), sentCodes.get(phone), ip);
        assertThat(result.purpose()).isEqualTo("RESET_PASSWORD");
        assertThat(result.loginId()).isNull();
        resets.confirm(result.passwordResetToken(), "Newpass456");
        assertThat(passwords.matches("Newpass456", credentials.findByLoginId(loginId).orElseThrow().getPassword())).isTrue();
    }

    @Test
    void wrongCodeAttemptsArePersistedAndFifthFailureLocksEvenTheCorrectCode() {
        var request = service.request("SIGNUP", phone, null, ip);
        String correct = sentCodes.get(phone);
        String wrong = correct.equals("000000") ? "000001" : "000000";
        for (int attempt = 1; attempt <= 5; attempt++) {
            assertError(() -> service.confirm(request.challengeId(), wrong, ip),
                    attempt == 5 ? ErrorType.PHONE_ATTEMPTS_EXCEEDED : ErrorType.BAD_REQUEST);
            assertThat(challenges.findById(request.challengeId()).orElseThrow().getAttempts()).isEqualTo(attempt);
        }
        assertError(() -> service.confirm(request.challengeId(), correct, ip), ErrorType.PHONE_ATTEMPTS_EXCEEDED);
        assertThat(challenges.findById(request.challengeId()).orElseThrow().isVerified()).isFalse();
    }

    @Test
    void malformedCodeAlsoCountsAsAnAttempt() {
        var request = service.request("SIGNUP", phone, null, ip);
        assertError(() -> service.confirm(request.challengeId(), "not-a-code", ip), ErrorType.BAD_REQUEST);
        assertThat(challenges.findById(request.challengeId()).orElseThrow().getAttempts()).isEqualTo(1);
        assertThat(service.confirm(request.challengeId(), sentCodes.get(phone), ip).verificationToken()).isNotBlank();
    }

    @Test
    void expiredOtpCannotRevealAnAccountOrIssueResetToken() {
        registerPhone(user, phone);
        var request = service.request("FIND_ID", phone, null, ip);
        jdbc.update("update phone_verification_challenges set expires_at = now() - interval '1 second' where id = ?", request.challengeId());
        assertError(() -> service.confirm(request.challengeId(), sentCodes.get(phone), ip), ErrorType.PHONE_CODE_EXPIRED);
        assertThat(resetTokens.findById(user.getUserId())).isEmpty();
    }

    @Test
    void signupReceiptIsSingleUseAndFailedSecondSignupDoesNotLeaveAnAccount() {
        String receipt = signupReceipt(phone);
        String first = newLogin();
        signup.create(new UserCommand.Create(null, null, null, first, "Oldpass123", null, receipt));
        String second = newLogin();
        assertError(() -> signup.create(new UserCommand.Create(null, null, null, second, "Oldpass123", null, receipt)), ErrorType.BAD_REQUEST);
        assertThat(users.existsByUsername(second)).isFalse();
        assertThat(credentials.findByLoginId(second)).isEmpty();
        assertThat(phones.findByPhoneNumber(phone).orElseThrow().getUserId())
                .isEqualTo(credentials.findByLoginId(first).orElseThrow().getUserId());
    }

    @Test
    void signupRollbackPreservesReceiptAndDoesNotAttachPhone() {
        String receipt = signupReceipt(phone);
        String candidate = newLogin();
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            signup.create(new UserCommand.Create(null, null, null, candidate, "Oldpass123", null, receipt));
            tx.setRollbackOnly();
        });
        assertThat(users.existsByUsername(candidate)).isFalse();
        assertThat(phones.findByPhoneNumber(phone)).isEmpty();
        signup.create(new UserCommand.Create(null, null, null, candidate, "Oldpass123", null, receipt));
        assertThat(phones.findByPhoneNumber(phone)).isPresent();
    }

    @Test
    void expiredAndForgedSignupReceiptsCannotBind() {
        String receipt = signupReceipt(phone);
        jdbc.update("update phone_verification_challenges set receipt_expires_at = now() - interval '1 second' where receipt_hash = ?",
                crypto.hash("signup-receipt", receipt));
        assertError(() -> service.bindSignupProof(user.getUserId(), receipt), ErrorType.BAD_REQUEST);
        assertError(() -> service.bindSignupProof(user.getUserId(), crypto.token()), ErrorType.BAD_REQUEST);
        assertThat(phones.findById(user.getUserId())).isEmpty();
    }

    @Test
    void otpIsPurposeAndAuthenticatedUserBound() {
        var request = service.requestBinding(user.getUserId(), phone, "Oldpass123", ip);
        String code = sentCodes.get(phone);
        UserModel another = account(newLogin());
        assertError(() -> service.confirm(request.challengeId(), code, ip), ErrorType.BAD_REQUEST);
        assertError(() -> service.confirmBinding(another.getUserId(), request.challengeId(), code, ip), ErrorType.BAD_REQUEST);
        assertThat(phones.findById(user.getUserId())).isEmpty();
        service.confirmBinding(user.getUserId(), request.challengeId(), code, ip);
        assertThat(phones.findById(user.getUserId())).isPresent();
        assertThat(phones.findById(another.getUserId())).isEmpty();
        assertError(() -> service.confirmBinding(user.getUserId(), request.challengeId(), code, ip), ErrorType.PHONE_CODE_EXPIRED);

        String signupPhone = newPhone();
        var signupRequest = service.request("SIGNUP", signupPhone, null, ip);
        assertError(() -> service.confirmBinding(user.getUserId(), signupRequest.challengeId(), sentCodes.get(signupPhone), ip), ErrorType.BAD_REQUEST);
        assertThat(service.confirm(signupRequest.challengeId(), sentCodes.get(signupPhone), ip).verificationToken()).isNotBlank();
    }

    @Test
    void tamperingWithStoredPurposeDoesNotRepurposeTheOriginalCode() {
        var request = service.request("SIGNUP", phone, null, ip);
        jdbc.update("update phone_verification_challenges set purpose = 'FIND_ID', user_id = ? where id = ?", user.getUserId(), request.challengeId());
        assertError(() -> service.confirm(request.challengeId(), sentCodes.get(phone), ip), ErrorType.BAD_REQUEST);
        assertThat(resetTokens.findById(user.getUserId())).isEmpty();
    }

    @Test
    void unknownPhoneMismatchedIdInactiveAndSocialAccountsSendNothing() {
        assertError(() -> service.request("FIND_ID", newPhone(), null, ip), ErrorType.BAD_REQUEST);
        registerPhone(user, phone);
        assertError(() -> service.request("RESET_PASSWORD", phone, "wrongid", ip), ErrorType.BAD_REQUEST);
        allowResend(phone);
        users.save(user.withdraw());
        assertError(() -> service.request("FIND_ID", phone, null, ip), ErrorType.BAD_REQUEST);
        UserModel social = users.save(UserModel.create(newLogin(), null, null));
        String socialPhone = newPhone();
        registerPhone(social, socialPhone);
        assertError(() -> service.request("FIND_ID", socialPhone, null, ip), ErrorType.BAD_REQUEST);
        verify(sms, never()).send(anyString(), anyString());
        assertThat(resetTokens.findById(user.getUserId())).isEmpty();
    }

    @Test
    void changedPhoneOrWithdrawnAccountInvalidatesOutstandingRecovery() {
        registerPhone(user, phone);
        var request = service.request("FIND_ID", phone, null, ip);
        jdbc.update("update user_recovery_phones set phone_number = ? where user_id = ?", newPhone(), user.getUserId());
        assertError(() -> service.confirm(request.challengeId(), sentCodes.get(phone), ip), ErrorType.BAD_REQUEST);
        jdbc.update("update user_recovery_phones set phone_number = ? where user_id = ?", phone, user.getUserId());
        users.save(user.withdraw());
        assertError(() -> service.confirm(request.challengeId(), sentCodes.get(phone), ip), ErrorType.BAD_REQUEST);
        assertThat(resetTokens.findById(user.getUserId())).isEmpty();
    }

    @Test
    void removedCredentialsAfterRequestCannotBeRecreatedByPhoneRecovery() {
        registerPhone(user, phone);
        var request = service.request("FIND_ID", phone, null, ip);
        credentialEntities.deleteById(credentials.findByLoginId(loginId).orElseThrow().getUserCredentialId());
        assertError(() -> service.confirm(request.challengeId(), sentCodes.get(phone), ip), ErrorType.BAD_REQUEST);
        assertThat(credentials.findByLoginId(loginId)).isEmpty();
    }

    @Test
    void resendingEnforcesCooldownAndHourlyQuotaAndReplacesOldOtp() {
        var first = service.request("SIGNUP", phone, null, ip);
        String oldCode = sentCodes.get(phone);
        assertError(() -> service.request("SIGNUP", phone, null, ip), ErrorType.TOO_MANY_REQUESTS);
        for (int count = 2; count <= 5; count++) {
            allowResend(phone);
            service.request("SIGNUP", phone, null, ip);
        }
        assertError(() -> service.confirm(first.challengeId(), oldCode, ip), ErrorType.PHONE_CODE_EXPIRED);
        allowResend(phone);
        assertError(() -> service.request("SIGNUP", phone, null, ip), ErrorType.TOO_MANY_REQUESTS);
        verify(sms, times(5)).send(anyString(), anyString());
    }

    @Test
    void smsFailureRollsBackChallengeAndKeepsTheCommittedSendQuota() {
        doThrow(new CoreException(ErrorType.SERVICE_UNAVAILABLE)).when(sms).send(anyString(), anyString());
        assertError(() -> service.request("SIGNUP", phone, null, ip), ErrorType.SERVICE_UNAVAILABLE);
        assertThat(jdbc.queryForObject("select count(*) from phone_verification_challenges where phone_number = ?", Integer.class, phone)).isZero();
        assertError(() -> service.request("SIGNUP", phone, null, ip), ErrorType.TOO_MANY_REQUESTS);
        verify(sms, times(1)).send(anyString(), anyString());
    }

    @Test
    void unavailableSmsConfigurationDoesNotCreateAChallengeOrFakeDelivery() {
        doThrow(new CoreException(ErrorType.SERVICE_UNAVAILABLE)).when(sms).requireAvailable();
        assertError(() -> service.request("SIGNUP", phone, null, ip), ErrorType.SERVICE_UNAVAILABLE);
        verify(sms, never()).send(anyString(), anyString());
        assertThat(jdbc.queryForObject("select count(*) from phone_verification_challenges where phone_number = ?", Integer.class, phone)).isZero();
    }

    @Test
    void incorrectCurrentPasswordCannotSendOrBindAndExistingPhoneCannotBeStolen() {
        assertError(() -> service.requestBinding(user.getUserId(), phone, "Wrongpass123", ip), ErrorType.BAD_REQUEST);
        verify(sms, never()).send(anyString(), anyString());
        assertThat(phones.findById(user.getUserId())).isEmpty();
        UserModel another = account(newLogin());
        registerPhone(another, phone);
        allowResend(phone);
        assertError(() -> service.requestBinding(user.getUserId(), phone, "Oldpass123", ip), ErrorType.CONFLICT);
        allowResend(phone);
        assertError(() -> service.request("SIGNUP", phone, null, ip), ErrorType.CONFLICT);
        assertThat(phones.findByPhoneNumber(phone).orElseThrow().getUserId()).isEqualTo(another.getUserId());
    }

    @Test
    void requesterQuotaCountsRejectedRequestsAndCannotBeBypassedWithNewPhones() {
        for (int i = 0; i < 20; i++) {
            assertError(() -> service.request("BIND", newPhone(), null, ip), ErrorType.BAD_REQUEST);
        }
        assertError(() -> service.request("SIGNUP", phone, null, ip), ErrorType.TOO_MANY_REQUESTS);
        verify(sms, never()).send(anyString(), anyString());
        for (int i = 0; i < 60; i++) {
            assertError(() -> service.confirm("not-a-challenge", "123456", ip), ErrorType.BAD_REQUEST);
        }
        assertError(() -> service.confirm("not-a-challenge", "123456", ip), ErrorType.TOO_MANY_REQUESTS);
    }

    @Test
    void concurrentConfirmationsIssueOnlyOneResetGrant() throws Exception {
        registerPhone(user, phone);
        var request = service.request("FIND_ID", phone, null, ip);
        String code = sentCodes.get(phone);
        var results = race(() -> {
            try { service.confirm(request.challengeId(), code, ip); return true; }
            catch (CoreException e) { assertThat(e.getErrorType()).isEqualTo(ErrorType.PHONE_CODE_EXPIRED); return false; }
        });
        assertThat(results).containsExactlyInAnyOrder(true, false);
        assertThat(resetTokens.findById(user.getUserId()).orElseThrow().getTokenHash()).isNotBlank();
    }

    @Test
    void concurrentRequestsRespectTheSamePhoneCooldown() throws Exception {
        var results = race(() -> {
            try { service.request("SIGNUP", phone, null, ip); return true; }
            catch (CoreException e) { assertThat(e.getErrorType()).isEqualTo(ErrorType.TOO_MANY_REQUESTS); return false; }
        });
        assertThat(results).containsExactlyInAnyOrder(true, false);
        verify(sms, times(1)).send(anyString(), anyString());
    }

    @Test
    void moreConcurrentRequestsThanConnectionsDoNotStarveTheQuotaTransactions() throws Exception {
        int count = 12;
        var ready = new CountDownLatch(count);
        var go = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(count)) {
            var futures = new java.util.ArrayList<Future<PhoneRecoveryApplicationService.Requested>>();
            for (int i = 0; i < count; i++) {
                String number = newPhone();
                String peer = ip + "-" + i;
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    if (!go.await(5, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                    return service.request("SIGNUP", number, null, peer);
                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            for (var future : futures) assertThat(future.get(10, TimeUnit.SECONDS).challengeId()).isNotBlank();
        }
        verify(sms, times(count)).send(anyString(), anyString());
    }

    @Test
    void concurrentVerifiedSignupsCannotBindTheSameNumberToTwoAccounts() throws Exception {
        String firstReceipt = signupReceipt(phone);
        allowResend(phone);
        String secondReceipt = signupReceipt(phone);
        var receipts = new java.util.concurrent.atomic.AtomicInteger();
        var results = race(() -> {
            String receipt = receipts.getAndIncrement() == 0 ? firstReceipt : secondReceipt;
            String candidate = newLogin();
            try {
                signup.create(new UserCommand.Create(null, null, null, candidate, "Oldpass123", null, receipt));
                return true;
            } catch (CoreException e) {
                assertThat(e.getErrorType()).isEqualTo(ErrorType.CONFLICT);
                assertThat(credentials.findByLoginId(candidate)).isEmpty();
                return false;
            }
        });
        assertThat(results).containsExactlyInAnyOrder(true, false);
        assertThat(phones.findByPhoneNumber(phone)).isPresent();
    }

    @Test
    void resetGrantAndOtpConsumptionRollbackTogether() {
        registerPhone(user, phone);
        var request = service.request("FIND_ID", phone, null, ip);
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            service.confirm(request.challengeId(), sentCodes.get(phone), ip);
            tx.setRollbackOnly();
        });
        assertThat(resetTokens.findById(user.getUserId())).isEmpty();
        assertThat(challenges.findById(request.challengeId()).orElseThrow().isConsumed()).isFalse();
        assertThat(service.confirm(request.challengeId(), sentCodes.get(phone), ip).passwordResetToken()).isNotBlank();
    }

    private String signupReceipt(String phone) {
        var request = service.request("SIGNUP", phone, null, ip);
        return service.confirm(request.challengeId(), sentCodes.get(phone), ip).verificationToken();
    }

    private UserModel account(String login) {
        var account = users.save(UserModel.create(login, null, login + "@example.com"));
        credentials.save(UserCredentialModel.create(account.getUserId(), login, passwords.encrypt("Oldpass123")));
        return account;
    }

    private void registerPhone(UserModel account, String phone) {
        phones.save(new UserRecoveryPhoneJpaEntity(account.getUserId(), phone));
    }

    private void allowResend(String phone) {
        jdbc.update("update phone_verification_rate_limits set last_requested_at = now() - interval '61 seconds' where bucket_key = ?",
                crypto.hash("rate-phone", phone));
    }

    private static String newPhone() {
        return "010" + ThreadLocalRandom.current().nextInt(10_000_000, 100_000_000);
    }

    private static String newLogin() { return "phone" + UUID.randomUUID().toString().replace("-", "").substring(0, 10); }

    private static void assertError(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, ErrorType type) {
        assertThatThrownBy(action).isInstanceOfSatisfying(CoreException.class, e -> assertThat(e.getErrorType()).isEqualTo(type));
    }

    private List<Boolean> race(Callable<Boolean> call) throws Exception {
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> task = () -> {
                ready.countDown();
                if (!go.await(5, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                return call.call();
            };
            var first = executor.submit(task);
            var second = executor.submit(task);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            return List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        }
    }
}
