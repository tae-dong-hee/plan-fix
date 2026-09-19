package taedonghee.plan_fix.application.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import taedonghee.plan_fix.domain.user.*;
import taedonghee.plan_fix.infrastructure.auth.PasswordResetJpaRepository;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import taedonghee.plan_fix.support.error.RateLimitException;

import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
        "app.password-reset.enabled=true", "app.password-reset.from=noreply@planfix.test",
        "app.frontend-base-url=https://planfix.test", "spring.mail.host=smtp.planfix.test",
        "security.jwt.secret=id-recovery-test-key-with-sufficient-length-for-testing",
        "spring.datasource.hikari.maximum-pool-size=3", "spring.datasource.hikari.connection-timeout=3000"
})
@RecordApplicationEvents
@ActiveProfiles("test")
class IdRecoveryIntegrationTest {
    @Autowired IdRecoveryApplicationService service;
    @Autowired PasswordResetApplicationService passwordResets;
    @Autowired PasswordResetJpaRepository resetTokens;
    @Autowired AuthApplicationService auth;
    @Autowired UserRepository users;
    @Autowired UserCredentialRepository credentials;
    @Autowired PasswordEncryptor passwords;
    @Autowired JwtTokenProvider sessions;
    @Autowired RecoveryRateLimitKey keys;
    @Autowired RecoveryRateLimiter limits;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired ApplicationEvents events;
    @MockitoBean JavaMailSender mail;

    private String loginId;
    private String email;
    private UserModel user;

    @BeforeEach
    void setup() {
        loginId = newLogin();
        email = loginId + "@example.com";
        user = account(loginId, email);
        events.clear();
    }

    @Test
    void idMailThenPasswordResetCompletesRecoveryWithoutChangingPasswordDuringIdLookup() {
        String oldSession = auth.login(new AuthCommand.Login(loginId, "Oldpass123")).accessToken();
        var receipt = service.request(" " + email.toUpperCase(Locale.ROOT) + " ");
        receipt.requireAccepted();
        var messages = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(messages.capture());
        assertThat(messages.getValue().getTo()).containsExactly(email);
        assertThat(messages.getValue().getText()).contains(loginId, "https://planfix.test/login", "https://planfix.test/forgot-password");
        assertThat(messages.getValue().getText()).doesNotContain("token=", "Oldpass123");
        assertThat(resetTokens.findById(user.getUserId())).isEmpty();
        assertThat(sessions.parse(oldSession)).isPresent();
        assertThat(passwords.matches("Oldpass123", credentials.findByLoginId(loginId).orElseThrow().getPassword())).isTrue();

        passwordResets.request(loginId, email).requireAccepted();
        String token = events.stream(PasswordResetMail.class).findFirst().orElseThrow().token();
        passwordResets.confirm(token, "Newpass456");
        assertThat(sessions.parse(oldSession)).isEmpty();
        assertThatThrownBy(() -> auth.login(new AuthCommand.Login(loginId, "Oldpass123"))).isInstanceOf(CoreException.class);
        assertThat(auth.login(new AuthCommand.Login(loginId, "Newpass456")).accessToken()).isNotBlank();
        assertError(() -> passwordResets.confirm(token, "Another789"), ErrorType.INVALID_PASSWORD_RESET_TOKEN);
    }

    @Test
    void unknownMalformedBlankAndInjectedEmailsNeverSend() {
        for (String invalid : new String[]{null, "", " ", "no-at-sign", "nobody" + UUID.randomUUID() + "@example.com", "a@example.com\r\nBcc:other@example.com"}) {
            assertError(() -> service.request(invalid), ErrorType.RECOVERY_EMAIL_MISMATCH);
        }
        verifyNoInteractions(mail);
        assertThat(events.stream(IdRecoveryMail.class)).isEmpty();
    }

    @Test
    void inactiveSocialAndNullEmailAccountsNeverSendAnId() {
        users.save(user.withdraw());
        assertError(() -> service.request(email), ErrorType.RECOVERY_EMAIL_MISMATCH);
        String socialEmail = newLogin() + "@example.com";
        users.save(UserModel.create(newLogin(), null, socialEmail));
        assertError(() -> service.request(socialEmail), ErrorType.RECOVERY_EMAIL_MISMATCH);
        account(newLogin(), null);
        assertError(() -> service.request("null@example.com"), ErrorType.RECOVERY_EMAIL_MISMATCH);
        verifyNoInteractions(mail);
    }

    @Test
    void legacyDomainCaseVariantsProduceOneMessageWithOnlyActiveLocalIds() {
        String secondLogin = newLogin();
        account(secondLogin, email.substring(0, email.indexOf('@')) + "@EXAMPLE.COM");
        String inactiveLogin = newLogin();
        var inactive = account(inactiveLogin, email.substring(0, 1).toUpperCase(Locale.ROOT) + email.substring(1));
        users.save(inactive.withdraw());

        service.request(email).requireAccepted();
        var captured = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(captured.capture());
        assertThat(captured.getValue().getTo()).containsExactly(email);
        assertThat(captured.getValue().getText()).contains(loginId, secondLogin).doesNotContain(inactiveLogin);
        assertThat(events.stream(IdRecoveryMail.class).findFirst().orElseThrow().loginIds()).containsExactly(loginId, secondLogin);
    }

    @Test
    void distinctStoredLocalPartCasingNeverSendsAnotherMailboxAccountId() {
        String secondLogin = newLogin();
        account(secondLogin, email.toUpperCase(Locale.ROOT));
        service.request(email).requireAccepted();
        var captured = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(captured.capture());
        assertThat(captured.getValue().getTo()).containsExactly(email);
        assertThat(captured.getValue().getText()).contains(loginId).doesNotContain(secondLogin);

        allowResend(email);
        clearInvocations(mail);
        service.request(email.toUpperCase(Locale.ROOT)).requireAccepted();
        verify(mail).send(captured.capture());
        assertThat(captured.getValue().getTo()).containsExactly(email.toUpperCase(Locale.ROOT));
        assertThat(captured.getValue().getText()).contains(secondLogin).doesNotContain(loginId);

        allowResend(email);
        clearInvocations(mail);
        String ambiguous = email.substring(0, 1).toUpperCase(Locale.ROOT) + email.substring(1);
        assertError(() -> service.request(ambiguous), ErrorType.RECOVERY_EMAIL_MISMATCH);
        verifyNoInteractions(mail);
    }

    @Test
    void normalizationCannotBypassCooldownOrFivePerHourLimit() {
        service.request(email).requireAccepted();
        assertThatThrownBy(() -> service.request(" " + email.toUpperCase(Locale.ROOT) + " "))
                .isInstanceOfSatisfying(RateLimitException.class, e -> assertThat(e.getRetryAfterSeconds()).isBetween(58L, 60L));
        for (int count = 2; count <= 5; count++) {
            allowResend(email);
            service.request(email).requireAccepted();
        }
        allowResend(email);
        assertThatThrownBy(() -> service.request(email))
                .isInstanceOfSatisfying(RateLimitException.class, e -> assertThat(e.getRetryAfterSeconds()).isBetween(3590L, 3600L));
        verify(mail, times(5)).send(any(SimpleMailMessage.class));
        assertThat(requestCount(bucket(email))).isEqualTo(5);
        jdbc.update("update account_recovery_rate_limits set window_started_at = now() - interval '3601 seconds' where bucket_key = ?", bucket(email));
        service.request(email).requireAccepted();
        verify(mail, times(6)).send(any(SimpleMailMessage.class));
    }

    @Test
    void twentyAttemptLimitRetainsItsWindowOnRejectionAndResetsAfterTheDatabaseBoundary() {
        String bucket = keys.hash("rate-email-login", loginId);
        for (int attempt = 0; attempt < 20; attempt++) limits.acquire("email-login", loginId, 20, 0);
        var before = jdbc.queryForMap("select window_started_at, last_requested_at from account_recovery_rate_limits where bucket_key = ?", bucket);

        for (int attempt = 0; attempt < 2; attempt++) {
            assertThatThrownBy(() -> limits.acquire("email-login", loginId, 20, 0))
                    .isInstanceOfSatisfying(RateLimitException.class, e -> assertThat(e.getRetryAfterSeconds()).isBetween(3590L, 3600L));
        }
        assertThat(requestCount(bucket)).isEqualTo(20);
        assertThat(jdbc.queryForMap("select window_started_at, last_requested_at from account_recovery_rate_limits where bucket_key = ?", bucket)).isEqualTo(before);

        jdbc.update("update account_recovery_rate_limits set window_started_at = now() - interval '3600 seconds' where bucket_key = ?", bucket);
        limits.acquire("email-login", loginId, 20, 0);
        assertThat(requestCount(bucket)).isEqualTo(1);
    }

    @Test
    void concurrentRequestsAtTheFinalSlotAcceptExactlyOneAndExposeRemainingTime() throws Exception {
        String domain = "retry-concurrent";
        String bucket = keys.hash("rate-" + domain, loginId);
        limits.acquire(domain, loginId, 2, 0);
        var ready = new CountDownLatch(4);
        var go = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(4)) {
            var futures = new java.util.ArrayList<Future<Boolean>>();
            for (int request = 0; request < 4; request++) futures.add(executor.submit(() -> {
                ready.countDown();
                if (!go.await(5, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                try { limits.acquire(domain, loginId, 2, 0); return true; }
                catch (RateLimitException rejected) {
                    assertThat(rejected.getRetryAfterSeconds()).isBetween(3590L, 3600L);
                    return false;
                }
            }));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            var accepted = new java.util.ArrayList<Boolean>();
            for (var future : futures) accepted.add(future.get(10, TimeUnit.SECONDS));
            assertThat(accepted).containsExactlyInAnyOrder(true, false, false, false);
        }
        assertThat(requestCount(bucket)).isEqualTo(2);
    }

    @Test
    void failedBusinessTransactionCannotRefundTheAttemptOrLoseItsRetryTime() {
        assertThatThrownBy(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
            limits.acquire("retry-rollback", loginId, 1, 0);
            throw new CoreException(ErrorType.RECOVERY_ACCOUNT_MISMATCH);
        })).isInstanceOf(CoreException.class);

        assertThat(requestCount(keys.hash("rate-retry-rollback", loginId))).isEqualTo(1);
        assertThatThrownBy(() -> limits.acquire("retry-rollback", loginId, 1, 0))
                .isInstanceOfSatisfying(RateLimitException.class, e -> assertThat(e.getRetryAfterSeconds()).isBetween(3590L, 3600L));
    }

    @Test
    void smtpFailureReturnsUnacceptedReceiptAndKeepsThePersistedQuota() {
        doThrow(new MailSendException("provider detail must not become an API message")).when(mail).send(any(SimpleMailMessage.class));
        var receipt = service.request(email);
        assertError(receipt::requireAccepted, ErrorType.SERVICE_UNAVAILABLE);
        assertError(() -> service.request(email), ErrorType.TOO_MANY_REQUESTS);
        verify(mail, times(1)).send(any(SimpleMailMessage.class));
        assertThat(resetTokens.findById(user.getUserId())).isEmpty();
        assertThat(passwords.matches("Oldpass123", credentials.findByLoginId(loginId).orElseThrow().getPassword())).isTrue();
    }

    @Test
    void transactionRollbackNeverDeliversButDoesNotEraseAbuseQuota() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            service.request(email);
            status.setRollbackOnly();
        });
        verifyNoInteractions(mail);
        assertError(() -> service.request(email), ErrorType.TOO_MANY_REQUESTS);
    }

    @Test
    void responseWaitsForSmtpAcceptanceAfterCommit() throws Exception {
        var sending = new CountDownLatch(1);
        var finish = new CountDownLatch(1);
        doAnswer(invocation -> {
            sending.countDown();
            if (!finish.await(5, TimeUnit.SECONDS)) throw new AssertionError("delivery timeout");
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));
        try (var executor = Executors.newSingleThreadExecutor()) {
            var response = executor.submit(() -> service.request(email));
            try {
                assertThat(sending.await(5, TimeUnit.SECONDS)).isTrue();
                assertThat(response.isDone()).isFalse();
                assertThat(jdbc.queryForObject("select request_count from account_recovery_rate_limits where bucket_key = ?", Integer.class, bucket(email))).isEqualTo(1);
            } finally { finish.countDown(); }
            response.get(5, TimeUnit.SECONDS).requireAccepted();
        }
    }

    @Test
    void concurrentCaseVariantRequestsSendOnlyOneMessage() throws Exception {
        var ready = new CountDownLatch(2);
        var go = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            Callable<Boolean> request = () -> {
                ready.countDown();
                if (!go.await(5, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                try { service.request(email.toUpperCase(Locale.ROOT)).requireAccepted(); return true; }
                catch (CoreException rejected) { assertThat(rejected.getErrorType()).isEqualTo(ErrorType.TOO_MANY_REQUESTS); return false; }
            };
            var first = executor.submit(request);
            var second = executor.submit(request);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            assertThat(List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))).containsExactlyInAnyOrder(true, false);
        }
        verify(mail, times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void moreConcurrentRequestsThanConnectionsDoNotStarveQuotaTransactions() throws Exception {
        int count = 12;
        var emails = new java.util.ArrayList<String>();
        for (int i = 0; i < count; i++) {
            String candidate = newLogin();
            emails.add(candidate + "@example.com");
            account(candidate, emails.getLast());
        }
        var ready = new CountDownLatch(count);
        var go = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(count)) {
            var futures = new java.util.ArrayList<Future<IdRecoveryMail>>();
            for (String recipient : emails) futures.add(executor.submit(() -> {
                ready.countDown();
                if (!go.await(5, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                return service.request(recipient);
            }));
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            for (var future : futures) future.get(10, TimeUnit.SECONDS).requireAccepted();
        }
        verify(mail, times(count)).send(any(SimpleMailMessage.class));
    }

    private UserModel account(String login, String address) {
        var account = users.save(UserModel.create(login, null, address));
        credentials.save(UserCredentialModel.create(account.getUserId(), login, passwords.encrypt("Oldpass123")));
        return account;
    }

    private static String newLogin() { return "find" + UUID.randomUUID().toString().replace("-", "").substring(0, 10); }
    private String bucket(String address) { return keys.hash("rate-id-recovery-email", address.toLowerCase(Locale.ROOT)); }
    private int requestCount(String bucket) {
        return jdbc.queryForObject("select request_count from account_recovery_rate_limits where bucket_key = ?", Integer.class, bucket);
    }
    private void allowResend(String address) {
        jdbc.update("update account_recovery_rate_limits set last_requested_at = now() - interval '61 seconds' where bucket_key = ?", bucket(address));
    }
    private static void assertError(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, ErrorType type) {
        assertThatThrownBy(action).isInstanceOfSatisfying(CoreException.class, e -> assertThat(e.getErrorType()).isEqualTo(type));
    }
}
