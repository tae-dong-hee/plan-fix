package taedonghee.plan_fix.infrastructure.auth;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import taedonghee.plan_fix.application.auth.PasswordResetMail;
import taedonghee.plan_fix.application.auth.IdRecoveryMail;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.net.URI;

@Slf4j
@Component
public class PasswordResetMailSender {
    private final ObjectProvider<JavaMailSender> mailSender;
    private final boolean enabled;
    private final String host;
    private final String from;
    private final String frontendBaseUrl;

    public PasswordResetMailSender(ObjectProvider<JavaMailSender> mailSender,
            @Value("${app.password-reset.enabled:false}") boolean enabled,
            @Value("${spring.mail.host:}") String host,
            @Value("${app.password-reset.from:}") String from,
            @Value("${app.frontend-base-url}") String frontendBaseUrl) {
        this.mailSender = mailSender;
        this.enabled = enabled;
        this.host = host;
        this.from = from;
        this.frontendBaseUrl = frontendBaseUrl.replaceAll("/+$", "");
    }

    public void requireAvailable() {
        if (!enabled || host.isBlank() || !validFrom() || !validFrontendUrl() || mailSender.getIfAvailable() == null) {
            throw new CoreException(ErrorType.SERVICE_UNAVAILABLE,
                    "현재 계정 안내 메일을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.");
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void send(PasswordResetMail event) {
        // Complete delivery before returning HTTP: Cloud Run may stop allocating
        // CPU after the response. SMTP timeouts bound each network operation.
        try {
            var message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(event.recipient());
            message.setSubject("[PlanFix] 비밀번호 재설정 안내");
            message.setText("안녕하세요. PlanFix 비밀번호 재설정을 요청하셨습니다.\n\n"
                    + "아래 링크에서 새 비밀번호를 설정해 주세요. 링크는 30분 동안 한 번만 사용할 수 있습니다.\n"
                    + frontendBaseUrl + "/reset-password#token=" + event.token()
                    + "\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요. 비밀번호는 변경되지 않습니다.");
            mailSender.getObject().send(message);
            event.markAccepted();
        } catch (RuntimeException e) {
            // Do not leak recipients, tokens, SMTP credentials or links through logs
            // The controller reads the unaccepted receipt and returns a generic 503.
            log.warn("Password reset mail delivery failed ({})", e.getClass().getSimpleName());
        }
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void send(IdRecoveryMail event) {
        try {
            var message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(event.recipient());
            message.setSubject("[PlanFix] 아이디 찾기 안내");
            message.setText("안녕하세요. PlanFix에 등록된 아이디를 안내합니다.\n\n"
                    + "아이디: " + String.join(", ", event.loginIds())
                    + "\n\n로그인: " + frontendBaseUrl + "/login"
                    + "\n비밀번호 찾기: " + frontendBaseUrl + "/forgot-password"
                    + "\n\n본인이 요청하지 않았다면 이 메일을 무시해 주세요. 비밀번호는 변경되지 않습니다.");
            mailSender.getObject().send(message);
            event.markAccepted();
        } catch (RuntimeException e) {
            // Never log provider diagnostics, recipients or account IDs.
            log.warn("ID recovery mail delivery failed ({})", e.getClass().getSimpleName());
        }
    }

    private boolean validFrom() {
        try {
            if (from.isBlank() || from.contains("\r") || from.contains("\n")) return false;
            var address = new InternetAddress(from, true);
            address.validate();
            return address.getAddress().contains("@");
        } catch (AddressException e) {
            return false;
        }
    }

    private boolean validFrontendUrl() {
        try {
            URI uri = URI.create(frontendBaseUrl);
            return ("https".equals(uri.getScheme()) || ("http".equals(uri.getScheme())
                    && ("localhost".equals(uri.getHost()) || "127.0.0.1".equals(uri.getHost()))))
                    && uri.getHost() != null && uri.getUserInfo() == null
                    && uri.getQuery() == null && uri.getFragment() == null;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
