package taedonghee.plan_fix.interfaces.api.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import taedonghee.plan_fix.application.auth.PasswordResetApplicationService;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.infrastructure.security.CookieFactory;
import taedonghee.plan_fix.infrastructure.security.JwtAuthenticationFilter;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.security.SecurityConfig;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = PasswordResetController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class, CookieFactory.class})
class PasswordResetControllerTest {
    @TestConfiguration @EnableWebSecurity static class SecurityTestConfiguration { }
    @Autowired MockMvc mvc;
    @MockitoBean PasswordResetApplicationService service;
    @MockitoBean JwtTokenProvider tokenProvider;
    @MockitoBean UserRepository users;

    @Test
    void anonymousRequestHasEmptyGenericNoStoreResponse() throws Exception {
        mvc.perform(post("/api/v1/auth/password-reset/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"loginId\":\"traveler\",\"email\":\"person@example.com\"}"))
                .andExpect(status().isNoContent()).andExpect(content().string(""))
                .andExpect(header().string("Cache-Control", "no-store"));
        verify(service).request("traveler", "person@example.com");
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
