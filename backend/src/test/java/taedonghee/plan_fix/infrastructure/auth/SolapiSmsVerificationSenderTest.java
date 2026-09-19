package taedonghee.plan_fix.infrastructure.auth;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.*;

class SolapiSmsVerificationSenderTest {
    private static final String API_KEY = "test-api-key";
    private static final String API_SECRET = "test-api-secret-never-log";
    private static final String FROM = "0212345678";
    private static final String TO = "01012345678";
    private static final String CODE = "064219";
    private static final String ACCEPTED = """
            {"failedMessageList":[],"groupInfo":{"status":"SENDING","count":{
              "registeredSuccess":1,"registeredFailed":0,"sentFailed":0}},
              "messageList":[{"messageId":"message-id","statusCode":"2000"}]}
            """;

    private final AtomicInteger requestCount = new AtomicInteger();
    private final List<CapturedRequest> captured = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private ExecutorService executor;
    private String baseUrl;
    private volatile int responseStatus = 200;
    private volatile String responseBody = ACCEPTED;
    private volatile long responseDelayMillis;

    @BeforeEach
    void startProvider() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newVirtualThreadPerTaskExecutor();
        server.setExecutor(executor);
        server.createContext("/", exchange -> {
            requestCount.incrementAndGet();
            captured.add(new CapturedRequest(exchange.getRequestMethod(), exchange.getRequestURI().getPath(),
                    exchange.getRequestHeaders().getFirst("Authorization"),
                    exchange.getRequestHeaders().getFirst("Content-Type"),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            try {
                Thread.sleep(responseDelayMillis);
                var body = responseBody.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.getResponseHeaders().set("Location", baseUrl + "/redirected");
                exchange.sendResponseHeaders(responseStatus, body.length);
                exchange.getResponseBody().write(body);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopProvider() {
        server.stop(0);
        executor.shutdownNow();
    }

    @Test
    void sendsSmsPayloadAndAuthenticatesWithFreshHmacSalt() throws Exception {
        var sender = sender(Duration.ofSeconds(2));
        var before = Instant.now();

        sender.requireAvailable();
        sender.send(TO, CODE);
        sender.send(TO, CODE);

        assertThat(captured).hasSize(2);
        var salts = new ArrayList<String>();
        for (var request : captured) {
            assertThat(request.method()).isEqualTo("POST");
            assertThat(request.path()).isEqualTo("/messages/v4/send-many/detail");
            assertThat(request.contentType()).startsWith("application/json");
            var auth = Pattern.compile("^HMAC-SHA256 apiKey=([^,]+), date=([^,]+), salt=([a-f0-9]{32}), signature=([a-f0-9]{64})$")
                    .matcher(request.authorization());
            assertThat(auth.matches()).isTrue();
            assertThat(auth.group(1)).isEqualTo(API_KEY);
            assertThat(Instant.parse(auth.group(2))).isBetween(before, Instant.now());
            salts.add(auth.group(3));
            var hmac = Mac.getInstance("HmacSHA256");
            hmac.init(new SecretKeySpec(API_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            assertThat(auth.group(4)).isEqualTo(HexFormat.of().formatHex(
                    hmac.doFinal((auth.group(2) + auth.group(3)).getBytes(StandardCharsets.UTF_8))));
            assertThat(request.authorization()).doesNotContain(API_SECRET);
            var payload = JsonMapper.builder().build().readTree(request.body());
            assertThat(payload.path("showMessageList").asBoolean()).isTrue();
            assertThat(payload.path("messages").size()).isEqualTo(1);
            var message = payload.path("messages").get(0);
            assertThat(message.path("to").asText()).isEqualTo(TO);
            assertThat(message.path("from").asText()).isEqualTo(FROM);
            assertThat(message.path("country").asText()).isEqualTo("82");
            assertThat(message.path("type").asText()).isEqualTo("SMS");
            assertThat(message.path("text").asText()).contains("[PlanFix]", "[" + CODE + "]");
            assertThat(message.path("text").asText().getBytes(StandardCharsets.UTF_8).length).isLessThanOrEqualTo(90);
        }
        assertThat(salts).doesNotHaveDuplicates();
    }

    @Test
    void disabledOrIncompleteConfigurationCannotSend() {
        for (var config : List.of(
                new String[]{"false", API_KEY, API_SECRET, FROM},
                new String[]{"true", "", API_SECRET, FROM},
                new String[]{"true", API_KEY, " ", FROM},
                new String[]{"true", API_KEY, API_SECRET, ""},
                new String[]{"true", API_KEY, API_SECRET, "+821012345678"},
                new String[]{"true", API_KEY, API_SECRET, "0101234567"},
                new String[]{"true", API_KEY, API_SECRET, "00000000000"},
                new String[]{"true", "key\r\nInjected: value", API_SECRET, FROM})) {
            var sender = new SolapiSmsVerificationSender(Boolean.parseBoolean(config[0]), config[1], config[2],
                    config[3], baseUrl, Duration.ofSeconds(2), true);
            assertUnavailable(sender::requireAvailable);
            assertUnavailable(() -> sender.send(TO, CODE));
        }
        assertThat(requestCount).hasValue(0);
    }

    @Test
    void rejectsInsecureOrUntrustedProductionEndpoints() {
        for (String url : List.of("http://api.solapi.com", "https://attacker.example",
                "https://api.solapi.com.attacker.example", "https://api.solapi.com@attacker.example",
                "https://user:password@api.solapi.com", "https://api.solapi.com:8443",
                "https://api.solapi.com?secret=yes", "https://api.solapi.com#fragment",
                "https://api.solapi.com/prefix", "http://127.0.0.1:8080", baseUrl,
                "//api.solapi.com", "javascript:alert(1)", "not a URL", "https://")) {
            var sender = new SolapiSmsVerificationSender(true, API_KEY, API_SECRET, FROM, url);
            assertUnavailable(sender::requireAvailable);
            assertUnavailable(() -> sender.send(TO, CODE));
        }
        assertThatCode(new SolapiSmsVerificationSender(true, API_KEY, API_SECRET, FROM,
                "https://api.solapi.com")::requireAvailable).doesNotThrowAnyException();
        assertThat(requestCount).hasValue(0);
    }

    @Test
    void rejectsInvalidRecipientsAndCodeWithoutCallingProvider() {
        var sender = sender(Duration.ofSeconds(2));
        for (String phone : List.of("", "+821012345678", "010-1234-5678", "0101234567", "0212345678", "01012345678,01087654321")) {
            assertThatThrownBy(() -> sender.send(phone, CODE)).isInstanceOfSatisfying(CoreException.class,
                    e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST));
        }
        for (String code : List.of("", "12345", "1234567", "abcdef", "123456\nInjected")) {
            assertThatThrownBy(() -> sender.send(TO, code)).isInstanceOfSatisfying(CoreException.class,
                    e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST));
        }
        assertThat(requestCount).hasValue(0);
    }

    @Test
    void httpSuccessWithProviderFailuresOrMissingAcceptanceIsRejected() {
        var sender = sender(Duration.ofSeconds(2));
        for (String body : List.of(
                ACCEPTED.replace("\"failedMessageList\":[]", "\"failedMessageList\":[{\"statusCode\":\"3040\"}]"),
                ACCEPTED.replace("\"registeredSuccess\":1", "\"registeredSuccess\":0"),
                ACCEPTED.replace("\"registeredFailed\":0", "\"registeredFailed\":1"),
                ACCEPTED.replace("\"sentFailed\":0", "\"sentFailed\":1"),
                ACCEPTED.replace("SENDING", "FAILED"),
                ACCEPTED.replace("SENDING", "DELETED"),
                ACCEPTED.replace("2000", "3040"),
                ACCEPTED.replace("\"messageList\"", "\"omittedMessageList\""),
                "{}", "null", "[]", "invalid-json")) {
            responseBody = body;
            assertUnavailable(() -> sender.send(TO, CODE));
        }
        assertThat(requestCount).hasValue(12);
    }

    @Test
    void providerErrorsRemainGenericAndDoNotLeakSensitiveDetailsInLogs() {
        var logger = (Logger) LoggerFactory.getLogger(SolapiSmsVerificationSender.class);
        var appender = new ListAppender<ILoggingEvent>();
        appender.start();
        logger.addAppender(appender);
        try {
            var sender = sender(Duration.ofSeconds(2));
            responseBody = "{\"error\":\"" + API_SECRET + ":" + TO + ":" + CODE + "\"}";
            for (int status : List.of(400, 401, 403, 429, 500, 503)) {
                responseStatus = status;
                assertUnavailable(() -> sender.send(TO, CODE));
            }
            assertThat(appender.list).hasSize(6).allSatisfy(event -> {
                assertThat(event.getFormattedMessage()).doesNotContain(API_KEY, API_SECRET, TO, CODE);
                assertThat(event.getThrowableProxy()).isNull();
            });
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }
    }

    @Test
    void neverFollowsRedirectsToForwardCredentials() {
        responseStatus = 302;
        var sender = sender(Duration.ofSeconds(2));

        assertUnavailable(() -> sender.send(TO, CODE));

        assertThat(requestCount).hasValue(1);
        assertThat(captured.get(0).path()).isEqualTo("/messages/v4/send-many/detail");
    }

    @Test
    void slowProviderTimesOutWithoutRetryingOtp() {
        responseDelayMillis = 1_500;
        var sender = sender(Duration.ofMillis(200));
        long started = System.nanoTime();

        assertUnavailable(() -> sender.send(TO, CODE));

        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
        assertThat(requestCount).hasValue(1);
    }

    @Test
    void unavailableNetworkCannotReportSuccessfulDelivery() {
        server.stop(0);
        var sender = sender(Duration.ofMillis(500));

        assertUnavailable(() -> sender.send(TO, CODE));

        assertThat(requestCount).hasValue(0);
    }

    @Test
    void interruptedDeliveryRestoresThreadInterruptFlag() {
        var sender = sender(Duration.ofSeconds(2));
        Thread.currentThread().interrupt();
        try {
            assertUnavailable(() -> sender.send(TO, CODE));
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
        } finally {
            Thread.interrupted();
        }
    }

    private SolapiSmsVerificationSender sender(Duration timeout) {
        return new SolapiSmsVerificationSender(true, API_KEY, API_SECRET, FROM, baseUrl, timeout, true);
    }

    private static void assertUnavailable(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call).isInstanceOfSatisfying(CoreException.class, error -> {
            assertThat(error.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE);
            assertThat(error.getMessage()).isEqualTo("현재 인증 문자를 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.");
            assertThat(error.getCause()).isNull();
        });
    }

    private record CapturedRequest(String method, String path, String authorization, String contentType, String body) {}
}
