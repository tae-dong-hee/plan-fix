package taedonghee.plan_fix.infrastructure.auth;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import taedonghee.plan_fix.application.auth.IdRecoveryMail;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class IdRecoveryMailSenderTest {
    @SuppressWarnings("unchecked")
    private final ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);

    @Test
    void sendsIdsToTheRegisteredEmailWithConfiguredLoginAndPasswordRecoveryLinks() {
        var mail = mock(JavaMailSender.class);
        when(provider.getObject()).thenReturn(mail);
        var event = new IdRecoveryMail("registered@example.com", List.of("traveler01", "dayplanner02"));

        sender("https://planfix.test/site///").send(event);

        var captured = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mail).send(captured.capture());
        var message = captured.getValue();
        assertThat(message.getFrom()).isEqualTo("noreply@example.com");
        assertThat(message.getTo()).containsExactly("registered@example.com");
        assertThat(message.getCc()).isNullOrEmpty();
        assertThat(message.getBcc()).isNullOrEmpty();
        assertThat(message.getSubject()).startsWith("[PlanFix]").contains("아이디");
        assertThat(message.getText()).contains("traveler01", "dayplanner02",
                        "https://planfix.test/site/login", "https://planfix.test/site/forgot-password")
                .doesNotContain("/reset-password", "#token=", "?token=", "///");
        assertThatCode(event::requireAccepted).doesNotThrowAnyException();
    }

    @Test
    void receiptBecomesAcceptedOnlyAfterSynchronousSmtpSendReturns() {
        var mail = mock(JavaMailSender.class);
        when(provider.getObject()).thenReturn(mail);
        var event = new IdRecoveryMail("registered@example.com", List.of("traveler01"));
        doAnswer(call -> {
            assertUnavailable(event);
            return null;
        }).when(mail).send(any(SimpleMailMessage.class));

        assertUnavailable(event);
        sender("https://planfix.test").send(event);

        verify(mail).send(any(SimpleMailMessage.class));
        assertThatCode(event::requireAccepted).doesNotThrowAnyException();
    }

    @Test
    void smtpFailureCannotBecomeSuccessOrExposeRecipientIdsAndProviderSecrets() {
        var mail = mock(JavaMailSender.class);
        when(provider.getObject()).thenReturn(mail);
        var event = new IdRecoveryMail("private@example.com", List.of("privateuser01", "privateuser02"));
        doThrow(new MailSendException("private@example.com privateuser01 privateuser02 smtp-secret"))
                .when(mail).send(any(SimpleMailMessage.class));
        var logger = (Logger) LoggerFactory.getLogger(PasswordResetMailSender.class);
        var logs = new ListAppender<ILoggingEvent>();
        logs.start();
        logger.addAppender(logs);
        try {
            assertThatCode(() -> sender("https://planfix.test").send(event)).doesNotThrowAnyException();

            assertUnavailable(event);
            assertThat(event.toString()).doesNotContain("private@example.com", "privateuser01", "privateuser02");
            assertThat(logs.list).isNotEmpty().allSatisfy(entry -> {
                assertThat(entry.getFormattedMessage()).doesNotContain("private@example.com", "privateuser01",
                        "privateuser02", "smtp-secret");
                assertThat(entry.getThrowableProxy()).isNull();
            });
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    @Test
    void missingTransportAtDeliveryLeavesReceiptUnaccepted() {
        when(provider.getObject()).thenThrow(new IllegalStateException("sensitive provider configuration"));
        var event = new IdRecoveryMail("private@example.com", List.of("privateuser01"));

        assertThatCode(() -> sender("https://planfix.test").send(event)).doesNotThrowAnyException();

        assertUnavailable(event);
    }

    private PasswordResetMailSender sender(String frontendUrl) {
        return new PasswordResetMailSender(provider, true, "smtp.example.com", "noreply@example.com", frontendUrl);
    }

    private static void assertUnavailable(IdRecoveryMail event) {
        assertThatThrownBy(event::requireAccepted).isInstanceOfSatisfying(CoreException.class, error -> {
            assertThat(error.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE);
            assertThat(error.getMessage()).doesNotContain("private@example.com", "privateuser01", "privateuser02",
                    "smtp-secret", "sensitive provider configuration");
            assertThat(error.getCause()).isNull();
        });
    }
}
