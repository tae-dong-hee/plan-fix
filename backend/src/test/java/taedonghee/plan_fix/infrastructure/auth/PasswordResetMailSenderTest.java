package taedonghee.plan_fix.infrastructure.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import taedonghee.plan_fix.application.auth.PasswordResetMail;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;


import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PasswordResetMailSenderTest {
    @SuppressWarnings("unchecked")
    private final ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);

    @Test
    void disabledMissingHostAndInvalidFromAlwaysReturnServiceUnavailable() {
        var mail = mock(JavaMailSender.class);
        when(provider.getIfAvailable()).thenReturn(mail);
        for (var sender : java.util.List.of(
                sender(false, "smtp.example.com", "noreply@example.com"),
                sender(true, "", "noreply@example.com"),
                sender(true, "smtp.example.com", "invalid"))) {
            assertThatThrownBy(sender::requireAvailable).isInstanceOfSatisfying(CoreException.class,
                    e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE));
        }
        verifyNoInteractions(mail);
    }

    @Test
    void missingMailProviderReturnsServiceUnavailable() {
        when(provider.getIfAvailable()).thenReturn(null);

        assertThatThrownBy(sender(true, "smtp.example.com", "noreply@example.com")::requireAvailable)
                .isInstanceOfSatisfying(CoreException.class,
                        e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE));
        verify(provider, never()).getObject();
    }

    @Test
    void unsafeFrontendUrlsCannotProduceResetMail() {
        var mail = mock(JavaMailSender.class);
        when(provider.getIfAvailable()).thenReturn(mail);
        for (String frontendUrl : java.util.List.of(
                "http://planfix.test", "https://user:password@planfix.test",
                "https://planfix.test?redirect=elsewhere", "https://planfix.test#fragment",
                "//planfix.test", "javascript:alert(1)", "https://", "not a URL")) {
            var sender = new PasswordResetMailSender(provider, true, "smtp.example.com",
                    "noreply@example.com", frontendUrl);
            assertThatThrownBy(sender::requireAvailable).as(frontendUrl)
                    .isInstanceOfSatisfying(CoreException.class,
                            e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE));
        }
        verifyNoInteractions(mail);
    }

    @Test
    void senderHeaderInjectionReturnsServiceUnavailable() {
        var mail = mock(JavaMailSender.class);
        when(provider.getIfAvailable()).thenReturn(mail);
        for (String from : java.util.List.of(
                "noreply@example.com\r\nBcc: other@example.com",
                "noreply@example.com\nBcc: other@example.com",
                "noreply@example.com\rBcc: other@example.com")) {
            assertThatThrownBy(sender(true, "smtp.example.com", from)::requireAvailable)
                    .isInstanceOfSatisfying(CoreException.class,
                            e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE));
        }
        verifyNoInteractions(mail);
    }

    @Test
    void deliveryFailuresNeverEscapeToRequest() {
        var mail = mock(JavaMailSender.class);
        when(provider.getObject()).thenReturn(mail);
        doThrow(new MailSendException("sensitive SMTP details")).when(mail).send(any(SimpleMailMessage.class));
        var event = new PasswordResetMail("private@example.com", "private-token");
        assertThatCode(() -> sender(true, "smtp.example.com", "noreply@example.com").send(event))
                .doesNotThrowAnyException();
        assertThat(event.toString()).doesNotContain("private");
    }

    private PasswordResetMailSender sender(boolean enabled, String host, String from) {
        return new PasswordResetMailSender(provider, enabled, host, from, "https://planfix.test");
    }
}
