package taedonghee.plan_fix.infrastructure.auth;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.mail.Message;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import taedonghee.plan_fix.application.auth.PasswordResetMail;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.ByteArrayInputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Exercises the real JavaMail SMTP transport without reaching an external mail server. */
class PasswordResetSmtpIntegrationTest {
    private static final String FROM = "noreply@planfix.test";
    private static final String RECIPIENT = "reset-recipient@example.test";
    private static final String TOKEN = "wire-test-token_8uG7-zK9";
    private static final String FRONTEND = "https://planfix.test";

    @Test
    void deliversUtf8MimeMessageWithConfiguredEnvelopeAndFragmentResetLink() throws Exception {
        try (var smtp = new LocalSmtpServer(null); var logs = new MailLogCapture()) {
            var sender = sender(smtp.port());

            sender.requireAvailable();
            var receipt = new PasswordResetMail(RECIPIENT, TOKEN);
            sender.send(receipt);
            assertThatCode(receipt::requireAccepted).doesNotThrowAnyException();

            var delivery = smtp.delivery();
            assertThat(delivery.commands()).contains("MAIL FROM:<" + FROM + ">", "RCPT TO:<" + RECIPIENT + ">");
            var message = new MimeMessage(Session.getInstance(new Properties()),
                    new ByteArrayInputStream(delivery.mime().getBytes(StandardCharsets.US_ASCII)));
            assertThat(((InternetAddress) message.getFrom()[0]).getAddress()).isEqualTo(FROM);
            assertThat(message.getRecipients(Message.RecipientType.TO)).hasSize(1);
            assertThat(((InternetAddress) message.getRecipients(Message.RecipientType.TO)[0]).getAddress())
                    .isEqualTo(RECIPIENT);
            assertThat(message.getSubject()).isEqualTo("[PlanFix] 비밀번호 재설정 안내");
            assertThat(message.getContentType().toLowerCase()).contains("text/plain", "charset=utf-8");
            assertThat(message.getContent().toString())
                    .contains("안녕하세요. PlanFix 비밀번호 재설정을 요청하셨습니다.")
                    .contains(FRONTEND + "/reset-password#token=" + TOKEN)
                    .contains("30분", "한 번만")
                    .doesNotContain("?token=", "localhost", "127.0.0.1", FRONTEND + "//");
            assertThat(logs.messages()).noneMatch(text -> text.contains(TOKEN) || text.contains(RECIPIENT));
        }
    }

    @Test
    void smtpRejectionDoesNotEscapeOrLogSensitiveServerResponse() throws Exception {
        String privateServerResponse = "554 rejected " + RECIPIENT + " " + TOKEN + " smtp-password-secret";
        try (var smtp = new LocalSmtpServer(privateServerResponse); var logs = new MailLogCapture()) {
            var sender = sender(smtp.port());
            sender.requireAvailable();

            var receipt = new PasswordResetMail(RECIPIENT, TOKEN);
            assertThatCode(() -> sender.send(receipt))
                    .doesNotThrowAnyException();
            assertThatThrownBy(receipt::requireAccepted).isInstanceOfSatisfying(CoreException.class,
                    e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE));

            // DATA reached a real socket before the server rejected delivery.
            assertThat(smtp.delivery().mime()).isNotBlank();
            assertThat(logs.messages()).containsExactly("Password reset mail delivery failed (MailSendException)");
            assertThat(logs.messages()).noneMatch(text -> text.contains(RECIPIENT)
                    || text.contains(TOKEN) || text.contains("smtp-password-secret"));
            assertThat(logs.events()).allMatch(event -> event.getThrowableProxy() == null);
        }
    }

    @Test
    void requiredStartTlsRefusesDeliveryWhenServerDoesNotAdvertiseTls() throws Exception {
        try (var smtp = new LocalSmtpServer(null); var logs = new MailLogCapture()) {
            var sender = sender(smtp.port(), true);
            sender.requireAvailable();

            var receipt = new PasswordResetMail(RECIPIENT, TOKEN);
            assertThatCode(() -> sender.send(receipt))
                    .doesNotThrowAnyException();
            assertThatThrownBy(receipt::requireAccepted).isInstanceOfSatisfying(CoreException.class,
                    e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE));

            assertThat(smtp.commands()).anyMatch(command -> command.startsWith("EHLO "))
                    .noneMatch(command -> command.startsWith("MAIL FROM:")
                            || command.startsWith("RCPT TO:") || command.equals("DATA"));
            assertThat(logs.messages()).containsExactly("Password reset mail delivery failed (MailSendException)");
            assertThat(logs.events()).allMatch(event -> event.getThrowableProxy() == null);
        }
    }

    private PasswordResetMailSender sender(int port) {
        return sender(port, false);
    }

    private PasswordResetMailSender sender(int port, boolean requireStartTls) {
        var transport = new JavaMailSenderImpl();
        transport.setHost("127.0.0.1");
        transport.setPort(port);
        transport.setDefaultEncoding(StandardCharsets.UTF_8.name());
        transport.getJavaMailProperties().setProperty("mail.smtp.connectiontimeout", "2000");
        transport.getJavaMailProperties().setProperty("mail.smtp.timeout", "2000");
        transport.getJavaMailProperties().setProperty("mail.smtp.writetimeout", "2000");
        transport.getJavaMailProperties().setProperty("mail.smtp.starttls.enable", Boolean.toString(requireStartTls));
        transport.getJavaMailProperties().setProperty("mail.smtp.starttls.required", Boolean.toString(requireStartTls));
        var beans = new StaticListableBeanFactory();
        beans.addBean("mailSender", transport);
        return new PasswordResetMailSender(beans.getBeanProvider(JavaMailSender.class), true,
                "127.0.0.1", FROM, FRONTEND + "/");
    }

    private static final class MailLogCapture implements AutoCloseable {
        private final Logger logger = (Logger) LoggerFactory.getLogger(PasswordResetMailSender.class);
        private final ListAppender<ILoggingEvent> appender = new ListAppender<>();

        private MailLogCapture() {
            appender.start();
            logger.addAppender(appender);
        }

        List<ILoggingEvent> events() {
            return List.copyOf(appender.list);
        }

        List<String> messages() {
            return events().stream().map(ILoggingEvent::getFormattedMessage).toList();
        }

        @Override
        public void close() {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    private record Delivery(List<String> commands, String mime) {}

    /** One loopback connection, bounded reads, and deterministic socket/thread cleanup. */
    private static final class LocalSmtpServer implements AutoCloseable {
        private final ServerSocket listener;
        private final ExecutorService executor;
        private final CompletableFuture<Delivery> delivery = new CompletableFuture<>();
        private final CompletableFuture<List<String>> exchange = new CompletableFuture<>();
        private volatile Socket client;

        private LocalSmtpServer(String rejection) throws Exception {
            listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
            listener.setSoTimeout(3000);
            executor = Executors.newSingleThreadExecutor(task -> {
                var thread = new Thread(task, "password-reset-local-smtp");
                thread.setDaemon(true);
                return thread;
            });
            executor.submit(() -> receive(rejection));
        }

        int port() {
            return listener.getLocalPort();
        }

        Delivery delivery() throws Exception {
            return delivery.get(3, TimeUnit.SECONDS);
        }

        List<String> commands() throws Exception {
            return exchange.get(3, TimeUnit.SECONDS);
        }

        private void receive(String rejection) {
            var commands = new ArrayList<String>();
            try (Socket socket = listener.accept()) {
                client = socket;
                socket.setSoTimeout(3000);
                var reader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
                var writer = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.US_ASCII));
                reply(writer, "220 localhost test SMTP");
                String line;
                while ((line = reader.readLine()) != null) {
                    commands.add(line);
                    if (line.startsWith("EHLO ") || line.startsWith("HELO ")) {
                        reply(writer, "250 localhost");
                    } else if (line.startsWith("MAIL FROM:") || line.startsWith("RCPT TO:") || line.equals("RSET")) {
                        reply(writer, "250 OK");
                    } else if (line.equals("DATA")) {
                        reply(writer, "354 End with <CRLF>.<CRLF>");
                        var mime = new StringBuilder();
                        while ((line = reader.readLine()) != null && !line.equals(".")) {
                            if (line.startsWith("..")) line = line.substring(1);
                            mime.append(line).append("\r\n");
                        }
                        if (line == null) throw new IllegalStateException("SMTP client closed before DATA terminator");
                        delivery.complete(new Delivery(List.copyOf(commands), mime.toString()));
                        reply(writer, rejection == null ? "250 accepted" : rejection);
                    } else if (line.equals("QUIT")) {
                        reply(writer, "221 bye");
                        return;
                    } else {
                        throw new IllegalStateException("Unexpected SMTP command: " + line.split(" ")[0]);
                    }
                }
            } catch (Exception e) {
                delivery.completeExceptionally(e);
            } finally {
                exchange.complete(List.copyOf(commands));
            }
        }

        private static void reply(BufferedWriter writer, String response) throws Exception {
            writer.write(response + "\r\n");
            writer.flush();
        }

        @Override
        public void close() throws Exception {
            try {
                listener.close();
                Socket socket = client;
                if (socket != null) socket.close();
            } finally {
                executor.shutdownNow();
                if (!executor.awaitTermination(3, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Local SMTP server did not terminate");
                }
            }
        }
    }
}
