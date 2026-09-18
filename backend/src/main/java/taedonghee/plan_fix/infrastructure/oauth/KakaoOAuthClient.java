package taedonghee.plan_fix.infrastructure.oauth;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import tools.jackson.databind.JsonNode;

import java.time.Duration;

/**
 * 카카오 OAuth API 호출 어댑터
 */
@Component
public class KakaoOAuthClient {

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final KakaoOAuthProperties properties;
    private final RestClient restClient;

    /**
     * 운영용 생성자. TourApiClient와 같이 클라이언트가 자기 RestClient를 직접 만든다.
     */
    @Autowired
    public KakaoOAuthClient(KakaoOAuthProperties properties) {
        this(properties, RestClient.builder().requestFactory(requestFactory()));
    }

    /**
     * 테스트에서 MockRestServiceServer를 물리기 위해 빌더를 주입받는 생성자
     */
    KakaoOAuthClient(KakaoOAuthProperties properties, RestClient.Builder restClientBuilder) {
        this.properties = properties;
        this.restClient = restClientBuilder.build();
    }

    /**
     * 로그인 흐름 중 호출이라 사용자를 오래 기다리게 하지 않도록 타임아웃을 짧게 잡는다.
     */
    private static SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT);
        factory.setReadTimeout(READ_TIMEOUT);
        return factory;
    }

    /**
     * 카카오 인가 화면 URL 생성
     */
    public String buildAuthorizeUrl(String state, String codeChallenge) {
        return UriComponentsBuilder.fromUriString(properties.authorizeUri())
                .queryParam("client_id", properties.clientId())
                .queryParam("redirect_uri", properties.redirectUri())
                .queryParam("response_type", "code")
                .queryParam("prompt", "login")
                .queryParam("state", state)
                .queryParam("scope", properties.scope())
                .queryParam("code_challenge", codeChallenge)
                .queryParam("code_challenge_method", "S256")
                .encode()
                .toUriString();
    }

    /**
     * 인가 코드를 카카오 access token으로 교환
     */
    public String exchangeCodeForAccessToken(String code, String codeVerifier) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("grant_type", "authorization_code");
        form.add("client_id", properties.clientId());
        form.add("redirect_uri", properties.redirectUri());
        form.add("code", code);
        form.add("code_verifier", codeVerifier);
        if (properties.clientSecret() != null && !properties.clientSecret().isBlank()) {
            form.add("client_secret", properties.clientSecret());
        }

        JsonNode body = post(properties.tokenUri(), form);
        JsonNode accessToken = body.get("access_token");
        if (accessToken == null || accessToken.asString().isBlank()) {
            throw new CoreException(ErrorType.UNAUTHORIZED, "카카오 토큰 응답에 access_token이 없습니다.");
        }
        return accessToken.asString();
    }

    /**
     * 카카오 access token으로 사용자 정보 조회
     */
    public KakaoUser fetchUser(String kakaoAccessToken) {
        JsonNode body;
        try {
            body = restClient.get()
                    .uri(properties.userInfoUri())
                    .header("Authorization", "Bearer " + kakaoAccessToken)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientException e) {
            throw new CoreException(ErrorType.INTERNAL_ERROR, "카카오 사용자 조회에 실패했습니다.");
        }
        if (body == null || body.get("id") == null) {
            throw new CoreException(ErrorType.INTERNAL_ERROR, "카카오 사용자 응답이 비어 있습니다.");
        }

        JsonNode account = body.path("kakao_account");
        JsonNode email = account.get("email");
        boolean emailVerified = account.path("is_email_verified").asBoolean(false);
        JsonNode nickname = account.path("profile").get("nickname");

        return new KakaoUser(
                body.get("id").asString(),
                nickname == null ? null : nickname.asString(),
                email == null ? null : email.asString(),
                emailVerified
        );
    }

    private JsonNode post(String uri, MultiValueMap<String, String> form) {
        try {
            return restClient.post()
                    .uri(uri)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientException e) {
            throw new CoreException(ErrorType.UNAUTHORIZED, "카카오 토큰 교환에 실패했습니다.");
        }
    }
}
