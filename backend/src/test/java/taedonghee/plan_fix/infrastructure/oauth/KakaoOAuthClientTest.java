package taedonghee.plan_fix.infrastructure.oauth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class KakaoOAuthClientTest {

    private static final KakaoOAuthProperties PROPERTIES = new KakaoOAuthProperties(
            "https://kauth.example/oauth/authorize",
            "https://kauth.example/oauth/token",
            "https://kapi.example/v2/user/me",
            "http://localhost:8080/api/v1/auth/kakao/callback",
            "profile_nickname,account_email",
            "test-client-id",
            "test-client-secret"
    );

    private RestClient.Builder builder;
    private MockRestServiceServer server;
    private KakaoOAuthClient client;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).build();
        client = new KakaoOAuthClient(PROPERTIES, builder);
    }

    @Test
    void 인가_URL에_PKCE와_state가_포함된다() {
        String url = client.buildAuthorizeUrl("state-value", "challenge-value");

        assertThat(url).startsWith("https://kauth.example/oauth/authorize?");
        assertThat(url).contains("client_id=test-client-id");
        assertThat(url).contains("response_type=code");
        assertThat(url).contains("prompt=login");
        assertThat(url).contains("state=state-value");
        assertThat(url).contains("code_challenge=challenge-value");
        assertThat(url).contains("code_challenge_method=S256");
        assertThat(url).contains("scope=profile_nickname,account_email");
        // ':'와 '/'는 RFC 3986 query 컴포넌트에서 허용되는 문자라 percent-encoding 대상이 아니다.
        assertThat(url).contains("redirect_uri=http://localhost:8080/api/v1/auth/kakao/callback");
    }

    @Test
    void 토큰_교환은_access_token을_돌려준다() {
        server.expect(requestTo("https://kauth.example/oauth/token"))
                .andRespond(withSuccess("{\"access_token\":\"kakao-token\",\"token_type\":\"bearer\"}",
                        MediaType.APPLICATION_JSON));

        assertThat(client.exchangeCodeForAccessToken("auth-code", "verifier")).isEqualTo("kakao-token");
        server.verify();
    }

    @Test
    void 사용자_조회는_닉네임과_인증된_이메일을_읽는다() {
        server.expect(requestTo("https://kapi.example/v2/user/me"))
                .andExpect(header("Authorization", "Bearer kakao-token"))
                .andRespond(withSuccess("""
                        {
                          "id": 1234567890,
                          "kakao_account": {
                            "email": "a@b.com",
                            "is_email_verified": true,
                            "profile": { "nickname": "홍길동" }
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        KakaoUser user = client.fetchUser("kakao-token");

        assertThat(user.id()).isEqualTo("1234567890");
        assertThat(user.nickname()).isEqualTo("홍길동");
        assertThat(user.email()).isEqualTo("a@b.com");
        assertThat(user.emailVerified()).isTrue();
        server.verify();
    }

    @Test
    void 이메일_동의를_받지_못하면_이메일은_비어_있다() {
        server.expect(requestTo("https://kapi.example/v2/user/me"))
                .andRespond(withSuccess("""
                        {
                          "id": 1234567890,
                          "kakao_account": { "profile": { "nickname": "길동" } }
                        }
                        """, MediaType.APPLICATION_JSON));

        KakaoUser user = client.fetchUser("kakao-token");

        assertThat(user.email()).isNull();
        assertThat(user.emailVerified()).isFalse();
        server.verify();
    }
}
