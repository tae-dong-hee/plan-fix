package taedonghee.plan_fix.infrastructure.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import taedonghee.plan_fix.application.auth.AuthToken;
import taedonghee.plan_fix.application.auth.AuthTokenProvider;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.infrastructure.auth.PasswordResetJpaRepository;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * HMAC-SHA256 기반 JWT 발급 및 검증 어댑터
 */
@Component
public class JwtTokenProvider implements AuthTokenProvider {

    private static final String HMAC_SHA256 = "HmacSHA256";
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;
    private final String secret;
    private final long accessTokenValiditySeconds;
    private final PasswordResetJpaRepository passwordResets;

    public JwtTokenProvider(
            ObjectMapper objectMapper,
            @Value("${security.jwt.secret}") String secret,
            @Value("${security.jwt.access-token-validity-seconds}") long accessTokenValiditySeconds,
            PasswordResetJpaRepository passwordResets
    ) {
        this.objectMapper = objectMapper;
        this.secret = secret;
        this.accessTokenValiditySeconds = accessTokenValiditySeconds;
        this.passwordResets = passwordResets;
    }

    /**
     * 사용자 access token 생성
     */
    @Override
    public AuthToken create(UserModel user) {
        String accessToken = createJwt(user);
        return new AuthToken(accessToken, "Bearer", accessTokenValiditySeconds);
    }

    /**
     * JWT 검증 및 클레임 추출
     */
    public Optional<JwtClaims> parse(String token) {
        try {
            String[] parts = token.split("\\.");
            if (parts.length != 3) {
                return Optional.empty();
            }

            String signingInput = parts[0] + "." + parts[1];
            if (!sign(signingInput).equals(parts[2])) {
                return Optional.empty();
            }

            Map<String, Object> payload = objectMapper.readValue(base64UrlDecode(parts[1]), MAP_TYPE);
            long expiresAt = ((Number) payload.get("exp")).longValue();
            if (Instant.now().getEpochSecond() >= expiresAt) {
                return Optional.empty();
            }

            Long userId = Long.valueOf(payload.get("sub").toString());
            long sessionVersion = ((Number) payload.getOrDefault("sv", 0L)).longValue();
            if (sessionVersion != passwordResets.findSessionVersion(userId).orElse(0L)) {
                return Optional.empty();
            }
            String username = payload.get("username").toString();
            String role = payload.get("role").toString();
            return Optional.of(new JwtClaims(userId, username, role));
        } catch (Exception e) {
            return Optional.empty();
        }
    }

    private String createJwt(UserModel user) {
        try {
            Map<String, Object> header = new LinkedHashMap<>();
            header.put("alg", "HS256");
            header.put("typ", "JWT");

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("sub", user.getUserId().toString());
            payload.put("username", user.getUsername());
            payload.put("role", user.getRole().name());
            payload.put("sv", passwordResets.findSessionVersion(user.getUserId()).orElse(0L));
            payload.put("exp", Instant.now().plusSeconds(accessTokenValiditySeconds).getEpochSecond());

            String encodedHeader = base64UrlEncode(objectMapper.writeValueAsBytes(header));
            String encodedPayload = base64UrlEncode(objectMapper.writeValueAsBytes(payload));
            String signingInput = encodedHeader + "." + encodedPayload;

            return signingInput + "." + sign(signingInput);
        } catch (Exception e) {
            throw new IllegalStateException("JWT creation failed.", e);
        }
    }

    private String sign(String value) throws Exception {
        Mac mac = Mac.getInstance(HMAC_SHA256);
        SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), HMAC_SHA256);
        mac.init(keySpec);
        return base64UrlEncode(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    }

    private String base64UrlEncode(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private byte[] base64UrlDecode(String value) {
        return Base64.getUrlDecoder().decode(value);
    }
}
