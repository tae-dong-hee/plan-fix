package taedonghee.plan_fix.infrastructure.auth;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class SolapiSmsVerificationSender implements SmsVerificationSender {
    private static final String UNAVAILABLE_MESSAGE = "현재 인증 문자를 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.";
    private static final String SEND_PATH = "/messages/v4/send-many/detail";
    private static final String MOBILE_NUMBER = "(?:010\\d{8}|01[16789]\\d{7,8})";
    private static final String SENDER_NUMBER = "(?:02\\d{7,8}|010\\d{8}|01[16789]\\d{7,8}|0[3-6][1-5]\\d{7,8}|070\\d{8}|050\\d{8,9}|1[568]\\d{6})";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final boolean enabled;
    private final String apiKey;
    private final String apiSecret;
    private final String senderNumber;
    private final URI endpoint;
    private final HttpClient client;
    private final Duration requestTimeout;

    @Autowired
    public SolapiSmsVerificationSender(
            @Value("${sms.enabled:false}") boolean enabled,
            @Value("${sms.solapi.api-key:}") String apiKey,
            @Value("${sms.solapi.api-secret:}") String apiSecret,
            @Value("${sms.solapi.sender-number:}") String senderNumber,
            @Value("${sms.solapi.api-base-url:https://api.solapi.com}") String baseUrl) {
        this(enabled, apiKey, apiSecret, senderNumber, baseUrl, Duration.ofSeconds(5), false);
    }

    // Loopback HTTP is available to transport tests only, never through configuration.
    SolapiSmsVerificationSender(boolean enabled, String apiKey, String apiSecret,
            String senderNumber, String baseUrl, Duration requestTimeout, boolean allowTestLoopback) {
        this.enabled = enabled;
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.senderNumber = senderNumber;
        this.endpoint = validatedEndpoint(baseUrl, allowTestLoopback);
        this.requestTimeout = requestTimeout;
        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Override
    public void requireAvailable() {
        if (!enabled || apiKey == null || !apiKey.matches("[A-Za-z0-9_-]+")
                || apiSecret == null || apiSecret.isBlank() || senderNumber == null
                || !senderNumber.matches(SENDER_NUMBER) || endpoint == null) {
            throw unavailable();
        }
    }

    @Override
    public void send(String phoneNumber, String code) {
        requireAvailable();
        // Do not allow caller-controlled message text or an arbitrary SMS destination.
        if (phoneNumber == null || !phoneNumber.matches(MOBILE_NUMBER)
                || code == null || !code.matches("\\d{6}")) {
            throw new CoreException(ErrorType.BAD_REQUEST, "휴대폰번호 또는 인증번호 형식이 올바르지 않습니다.");
        }

        try {
            var payload = Map.of(
                    "messages", List.of(Map.of("to", phoneNumber, "from", senderNumber,
                            "country", "82", "type", "SMS",
                            "text", "[PlanFix] 인증번호 [" + code + "] 타인에게 알려주지 마세요.")),
                    "showMessageList", true);
            var request = HttpRequest.newBuilder(endpoint)
                    .timeout(requestTimeout)
                    .header("Content-Type", "application/json; charset=utf-8")
                    .header("Authorization", authorization())
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(payload), StandardCharsets.UTF_8))
                    .build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() != 200 || !accepted(JSON.readTree(response.body()))) {
                // Never log the response body: providers can echo recipients and message text.
                log.warn("SMS provider did not accept verification message (HTTP {})", response.statusCode());
                throw unavailable();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (IOException | GeneralSecurityException e) {
            log.warn("SMS verification delivery failed ({})", e.getClass().getSimpleName());
            throw unavailable();
        } catch (RuntimeException e) {
            if (e instanceof CoreException) throw e;
            log.warn("SMS verification delivery failed ({})", e.getClass().getSimpleName());
            throw unavailable();
        }
    }

    private String authorization() throws GeneralSecurityException {
        String date = Instant.now().toString();
        byte[] saltBytes = new byte[16];
        RANDOM.nextBytes(saltBytes);
        String salt = HexFormat.of().formatHex(saltBytes);
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(apiSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = HexFormat.of().formatHex(mac.doFinal((date + salt).getBytes(StandardCharsets.UTF_8)));
        return "HMAC-SHA256 apiKey=" + apiKey + ", date=" + date + ", salt=" + salt + ", signature=" + signature;
    }

    private static boolean accepted(JsonNode response) {
        if (response == null) return false;
        var failures = response.path("failedMessageList");
        var group = response.path("groupInfo");
        var count = group.path("count");
        var messages = response.path("messageList");
        return failures.isArray() && failures.isEmpty()
                && count.path("registeredSuccess").asInt(-1) == 1
                && count.path("registeredFailed").asInt(-1) == 0
                && count.path("sentFailed").asInt(0) == 0
                && !List.of("FAILED", "DELETED").contains(group.path("status").asText())
                && messages.isArray() && messages.size() == 1
                && "2000".equals(messages.get(0).path("statusCode").asText());
    }

    private static URI validatedEndpoint(String baseUrl, boolean allowTestLoopback) {
        if (baseUrl == null) return null;
        try {
            URI base = URI.create(baseUrl);
            boolean trustedHttps = "https".equals(base.getScheme()) && "api.solapi.com".equals(base.getHost())
                    && (base.getPort() == -1 || base.getPort() == 443);
            boolean testLoopback = allowTestLoopback && "http".equals(base.getScheme())
                    && "127.0.0.1".equals(base.getHost());
            if ((!trustedHttps && !testLoopback) || base.getUserInfo() != null
                    || base.getQuery() != null || base.getFragment() != null
                    || !(base.getPath().isEmpty() || "/".equals(base.getPath()))) {
                return null;
            }
            return base.resolve(SEND_PATH);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static CoreException unavailable() {
        return new CoreException(ErrorType.SERVICE_UNAVAILABLE, UNAVAILABLE_MESSAGE);
    }
}
