package taedonghee.plan_fix.interfaces.api.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import taedonghee.plan_fix.application.auth.PasswordResetApplicationService;
import taedonghee.plan_fix.application.auth.PasswordResetMail;
import taedonghee.plan_fix.application.auth.RecoveryRateLimiter;
import taedonghee.plan_fix.application.auth.RecoveryRequestLimiter;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.infrastructure.security.CookieFactory;
import taedonghee.plan_fix.infrastructure.security.JwtAuthenticationFilter;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.security.SecurityConfig;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import taedonghee.plan_fix.support.error.RateLimitException;

import static org.hamcrest.Matchers.containsString;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = PasswordResetController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, CookieFactory.class})
class PasswordResetControllerTest {
    @TestConfiguration @EnableWebSecurity static class SecurityTestConfiguration { }
    @Autowired MockMvc mvc;
    @Value("${app.frontend-base-url}") String frontendBaseUrl;
    @MockitoBean PasswordResetApplicationService service;
    @MockitoBean RecoveryRateLimiter rateLimiter;
    @MockitoBean RecoveryRequestLimiter requestLimiter;
    @MockitoBean JwtTokenProvider tokenProvider;
    @MockitoBean UserRepository users;

    @Test
    void debugDescriptionsCannotRevealRecoverySecrets() {
        assertThat(new PasswordResetController.Request("private-login", "private@example.com").toString())
                .doesNotContain("private-login", "private@example.com");
        assertThat(new PasswordResetController.Confirm("private-token", "PrivatePassword123").toString())
                .doesNotContain("private-token", "PrivatePassword123");
        assertThat(new PasswordResetMail("private@example.com", "private-token").toString())
                .doesNotContain("private@example.com", "private-token");
    }

    @Test
    void acceptedMailHasNoStoreSuccessResponse() throws Exception {
        var delivery = new PasswordResetMail("person@example.com", "test-token");
        delivery.markAccepted();
        when(service.request("traveler", "person@example.com")).thenReturn(delivery);
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isNoContent()).andExpect(content().string(""))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().doesNotExist("Retry-After"));
        verify(service).request("traveler", "person@example.com");
        verify(requestLimiter).acquireRequest("127.0.0.1");
        verify(rateLimiter).acquire("email-login", "traveler", 20, 0);
    }

    @Test
    void requestLimitAppliesBeforeAccountLookupAndIgnoresForwardedHeader() throws Exception {
        doThrow(new RateLimitException(1234)).when(requestLimiter)
                .acquireRequest("127.0.0.1");
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Forwarded-For", "203.0.113.10")
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "1234"));
        verifyNoInteractions(service);
    }

    @Test
    void loginIdLimitAppliesBeforeCheckingEmail() throws Exception {
        doThrow(new RateLimitException(3541)).when(rateLimiter)
                .acquire("email-login", "traveler", 20, 0);
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\" traveler \",\"email\":\"different@example.com\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "3541"));
        verifyNoInteractions(service);
    }

    @Test
    void failedDeliveryCannotReturnSuccess() throws Exception {
        when(service.request(any(), any())).thenReturn(new PasswordResetMail("person@example.com", "test-token"));
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isServiceUnavailable()).andExpect(header().doesNotExist("Retry-After"));
    }

    @Test
    void accountCooldownReturnsItsActualRemainingSeconds() throws Exception {
        when(service.request("traveler", "person@example.com")).thenThrow(new RateLimitException(23));
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "23"))
                .andExpect(jsonPath("$.message").value("요청이 많습니다. 23초 후 다시 시도해 주세요."));
    }

    @Test
    void allowedFrontendOriginCanReadRetryAfterButOtherOriginsRemainBlocked() throws Exception {
        when(service.request("traveler", "person@example.com")).thenThrow(new RateLimitException(23));
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", frontendBaseUrl)
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "23"))
                .andExpect(header().string("Access-Control-Allow-Origin", frontendBaseUrl))
                .andExpect(header().string("Access-Control-Expose-Headers", "Retry-After"));

        clearInvocations(service);
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .header("Origin", "https://untrusted.example")
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"))
                .andExpect(header().doesNotExist("Retry-After"));
        verifyNoInteractions(service);
    }

    @Test
    void confirmationRateLimitReturnsRetryTimeBeforeConsumingAnyToken() throws Exception {
        doThrow(new RateLimitException(1800)).when(requestLimiter).acquireConfirmation("127.0.0.1");
        mvc.perform(post("/api/v1/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"example\",\"password\":\"Newpass123\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "1800"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        verifyNoInteractions(service);
    }

    @Test
    void mismatchedIdOrEmailHasClearMessage() throws Exception {
        when(service.request(any(), any())).thenThrow(new CoreException(ErrorType.RECOVERY_ACCOUNT_MISMATCH));
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(header().doesNotExist("Retry-After"))
                .andExpect(jsonPath("$.message").value("아이디 또는 이메일이 일치하지 않습니다."));
    }

    @Test
    void anonymousConfirmationClearsCookieAndBadTokenHasDistinctCode() throws Exception {
        mvc.perform(post("/api/v1/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"example\",\"password\":\"Newpass123\"}"))
                .andExpect(status().isNoContent()).andExpect(header().string("Set-Cookie", containsString("Max-Age=0")));
        doThrow(new CoreException(ErrorType.INVALID_PASSWORD_RESET_TOKEN)).when(service).confirm("example", "Newpass123");
        mvc.perform(post("/api/v1/auth/password-reset/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"example\",\"password\":\"Newpass123\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_PASSWORD_RESET_TOKEN"));
    }

    @Test
    void unavailableMailReturnsRetryable503() throws Exception {
        doThrow(new CoreException(ErrorType.SERVICE_UNAVAILABLE)).when(service).request(any(), any());
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isServiceUnavailable());
    }
}
