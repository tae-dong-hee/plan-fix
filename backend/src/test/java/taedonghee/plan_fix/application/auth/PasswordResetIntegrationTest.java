package taedonghee.plan_fix.application.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import taedonghee.plan_fix.domain.user.*;
import taedonghee.plan_fix.infrastructure.auth.PasswordResetJpaRepository;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.user.UserCredentialJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
        "app.password-reset.enabled=true", "app.password-reset.from=noreply@planfix.test",
        "app.frontend-base-url=https://planfix.test", "spring.mail.host=smtp.planfix.test",
        "security.jwt.secret=password-reset-test-signing-key-with-sufficient-length"
})
@RecordApplicationEvents
@ActiveProfiles("test")
class PasswordResetIntegrationTest {
    @Autowired PasswordResetApplicationService service;
    @Autowired AuthApplicationService auth;
    @Autowired UserRepository users;
    @Autowired UserCredentialRepository credentials;
    @Autowired UserCredentialJpaRepository credentialEntities;
    @Autowired PasswordResetJpaRepository resets;
    @Autowired PasswordEncryptor passwords;
    @Autowired JwtTokenProvider tokens;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired ApplicationEvents events;
    @Autowired ObjectMapper mapper;
    @MockitoBean JavaMailSender mail;

    private String loginId;
    private String email;
    private UserModel user;

    @BeforeEach
    void createAccount() {
        loginId = "reset" + UUID.randomUUID().toString().replace("-", "").substring(0, 10);
        email = loginId + "@example.com";
        user = users.save(UserModel.create(loginId, null, email));
        credentials.save(UserCredentialModel.create(user.getUserId(), loginId, passwords.encrypt("Oldpass123")));
        events.clear();
    }

    @Test
    void resetChangesRealPasswordConsumesTokenAndRevokesNewAndLegacySessions() throws Exception {
        String previousJwt = auth.login(new AuthCommand.Login(loginId, "Oldpass123")).accessToken();
        String legacyJwt = legacyJwt();
        assertThat(tokens.parse(legacyJwt)).isPresent();
        String token = requestToken();
        var stored = resets.findById(user.getUserId()).orElseThrow();
        assertThat(token).matches("[A-Za-z0-9_-]{43}");
        assertThat(stored.getTokenHash()).isEqualTo(HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII))));
        assertThat(stored.getExpiresAt()).isAfter(Instant.now().plusSeconds(29 * 60));
        assertThat(tokens.parse(previousJwt)).isPresent();

        service.confirm(token, "Newpass456");

        assertThat(passwords.matches("Newpass456", credentials.findByLoginId(loginId).orElseThrow().getPassword())).isTrue();
        assertThat(tokens.parse(previousJwt)).isEmpty();
        assertThat(tokens.parse(legacyJwt)).isEmpty();
        assertThatThrownBy(() -> auth.login(new AuthCommand.Login(loginId, "Oldpass123")))
                .isInstanceOf(CoreException.class);
        String newJwt = auth.login(new AuthCommand.Login(loginId, "Newpass456")).accessToken();
        assertThat(tokens.parse(newJwt)).isPresent();
        assertInvalid(() -> service.confirm(token, "Another789"));
        assertThat(resets.findById(user.getUserId()).orElseThrow().getTokenHash()).isNull();
        assertThat(resets.findSessionVersion(user.getUserId())).contains(1L);

        allowResend();
        requestToken();
        assertThat(tokens.parse(previousJwt)).isEmpty();
        assertThat(tokens.parse(legacyJwt)).isEmpty();
        assertThat(tokens.parse(newJwt)).isPresent();
        assertThat(passwords.matches("Newpass456", credentials.findByLoginId(loginId).orElseThrow().getPassword())).isTrue();
    }

    @Test
    void mailUsesStoredEmailAndFixedOriginFragmentAndIsNotDeliveredOnRollback() {
        String token = requestToken();
        var captor = org.mockito.ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail, timeout(3000)).send(captor.capture());
        assertThat(captor.getValue().getTo()).containsExactly(email);
        assertThat(captor.getValue().getText()).contains("https://planfix.test/reset-password#token=" + token);

        allowResend();
        clearInvocations(mail);
        var tx = new TransactionTemplate(transactions);
        tx.executeWithoutResult(status -> {
            service.request(loginId, email);
            status.setRollbackOnly();
        });
        verifyNoInteractions(mail);
        // The existing link remains valid because the replacement rolled back.
        service.confirm(token, "Newpass456");
    }

    @Test
    void requestWaitsForDeliveryAfterDatabaseCommit() throws Exception {
        var sending = new CountDownLatch(1);
        var finishSending = new CountDownLatch(1);
        doAnswer(invocation -> {
            sending.countDown();
            if (!finishSending.await(5, TimeUnit.SECONDS)) throw new AssertionError("delivery timeout");
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));

        try (var executor = Executors.newSingleThreadExecutor()) {
            var response = executor.submit(() -> service.request(loginId, email));
            try {
                assertThat(sending.await(5, TimeUnit.SECONDS)).isTrue();
                // Visible from another connection: the token has already committed.
                assertThat(resets.findById(user.getUserId())).isPresent();
                assertThat(response.isDone()).isFalse();
            } finally {
                finishSending.countDown();
            }
            response.get(5, TimeUnit.SECONDS);
        }
    }

    @Test
    void unknownMismatchInactiveAndSocialOnlyRequestsDoNotSendOrCreateTokens() {
        service.request("unknownid", email);
        service.request(loginId, "someoneelse@example.com");
        service.request(null, null);
        users.save(user.withdraw());
        service.request(loginId, email);
        assertThat(events.stream(PasswordResetMail.class)).isEmpty();
        assertThat(resets.findById(user.getUserId())).isEmpty();

        // A social account has a user row but no local credential row.
        credentialEntities.deleteById(credentials.findByLoginId(loginId).orElseThrow().getUserCredentialId());
        service.request(loginId, email);
        assertThat(events.stream(PasswordResetMail.class)).isEmpty();
        verifyNoInteractions(mail);
    }

    @Test
    void resendIsLimitedAndReplacesPreviousLinkAfterCooldown() {
        String first = requestToken();
        service.request(loginId, email);
        assertThat(events.stream(PasswordResetMail.class)).hasSize(1);
        allowResend();
        String second = requestToken();
        assertThat(second).isNotEqualTo(first);
        assertInvalid(() -> service.confirm(first, "Newpass456"));
        service.confirm(second, "Newpass456");
    }

    @Test
    void expiredAndMalformedTokensCannotChangePassword() {
        String token = requestToken();
        jdbc.update("update password_reset_tokens set expires_at = now() - interval '1 second' where user_id = ?", user.getUserId());
        assertInvalid(() -> service.confirm(token, "Newpass456"));
        assertInvalid(() -> service.confirm(null, "Newpass456"));
        assertInvalid(() -> service.confirm("invalid", "Newpass456"));
        assertThat(passwords.matches("Oldpass123", credentials.findByLoginId(loginId).orElseThrow().getPassword())).isTrue();
        assertThat(resets.findSessionVersion(user.getUserId())).contains(0L);
    }

    @Test
    void invalidPasswordAndTransactionRollbackPreserveUsableTokenAndOldPassword() {
        String token = requestToken();
        assertThatThrownBy(() -> service.confirm(token, "short"))
                .isInstanceOfSatisfying(CoreException.class, e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST));
        var tx = new TransactionTemplate(transactions);
        tx.executeWithoutResult(status -> {
            service.confirm(token, "Newpass456");
            status.setRollbackOnly();
        });
        assertThat(passwords.matches("Oldpass123", credentials.findByLoginId(loginId).orElseThrow().getPassword())).isTrue();
        assertThat(resets.findSessionVersion(user.getUserId())).contains(0L);
        service.confirm(token, "Newpass456");
    }

    @Test
    void concurrentConfirmationsConsumeTokenOnlyOnce() throws Exception {
        String token = requestToken();
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> attempt = () -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                try {
                    service.confirm(token, "Newpass456");
                    return true;
                } catch (CoreException e) {
                    assertThat(e.getErrorType()).isEqualTo(ErrorType.INVALID_PASSWORD_RESET_TOKEN);
                    return false;
                }
            };
            var first = executor.submit(attempt);
            var second = executor.submit(attempt);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(java.util.List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
        assertThat(resets.findSessionVersion(user.getUserId())).contains(1L);
        assertThat(passwords.matches("Newpass456", credentials.findByLoginId(loginId).orElseThrow().getPassword())).isTrue();
    }

    private String requestToken() {
        service.request(loginId, email.toUpperCase(java.util.Locale.ROOT));
        return events.stream(PasswordResetMail.class).reduce((first, last) -> last).orElseThrow().token();
    }

    private void allowResend() {
        jdbc.update("update password_reset_tokens set requested_at = now() - interval '61 seconds' where user_id = ?", user.getUserId());
    }

    private void assertInvalid(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(CoreException.class,
                e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.INVALID_PASSWORD_RESET_TOKEN));
    }

    private String legacyJwt() throws Exception {
        var payload = new LinkedHashMap<String, Object>();
        payload.put("sub", user.getUserId().toString());
        payload.put("username", user.getUsername());
        payload.put("role", "USER");
        payload.put("exp", Instant.now().plusSeconds(300).getEpochSecond());
        var encoder = Base64.getUrlEncoder().withoutPadding();
        String input = encoder.encodeToString("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8))
                + "." + encoder.encodeToString(mapper.writeValueAsBytes(payload));
        var mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("password-reset-test-signing-key-with-sufficient-length".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return input + "." + encoder.encodeToString(mac.doFinal(input.getBytes(StandardCharsets.UTF_8)));
    }
}
