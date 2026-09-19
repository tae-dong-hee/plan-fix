package taedonghee.plan_fix.interfaces.api.user;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import taedonghee.plan_fix.application.user.UserApplicationService;
import taedonghee.plan_fix.application.user.UserCommand;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.infrastructure.security.JwtAuthenticationFilter;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.security.SecurityConfig;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = UserController.class, properties = "app.frontend-base-url=http://localhost:3000")
@Import({SecurityConfig.class, JwtAuthenticationFilter.class})
class EmailAvailabilitySecurityTest {
    @TestConfiguration
    @EnableWebSecurity
    static class SecurityTestConfiguration { }

    private static final String PATH = "/api/v1/users/email-availability";

    @Autowired private MockMvc mvc;
    @MockitoBean private UserApplicationService service;
    @MockitoBean private JwtTokenProvider tokenProvider;
    @MockitoBean private UserRepository users;

    @Test
    void anonymousVisitorCanCheckAvailableEmail() throws Exception {
        when(service.isEmailAvailable("new+trip@example.com")).thenReturn(true);

        mvc.perform(get(PATH).param("email", "new+trip@example.com"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.message").value("사용 가능한 이메일입니다."));
        verify(service).isEmailAvailable("new+trip@example.com");
    }

    @Test
    void duplicateEmailUsesTheKoreanMessage() throws Exception {
        when(service.isEmailAvailable("taken@example.com")).thenReturn(false);

        mvc.perform(get(PATH).param("email", "taken@example.com"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                .andExpect(jsonPath("$.message").value("이미 가입된 이메일입니다."));
    }

    @Test
    void signupConflictPreservesTheKoreanMessage() throws Exception {
        when(service.create(any(UserCommand.Create.class)))
                .thenThrow(new CoreException(ErrorType.CONFLICT, "이미 가입된 이메일입니다."));

        mvc.perform(post("/api/v1/users").contentType(MediaType.APPLICATION_JSON).content("""
                {"loginId":"traveler01","password":"Password1!","name":"홍길동","email":"taken@example.com"}
                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("이미 가입된 이메일입니다."));
    }

    @Test
    void availabilityDoesNotExposeOtherUserRoutes() throws Exception {
        mvc.perform(get("/api/v1/users")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/users/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/users/7")).andExpect(status().isUnauthorized());
        mvc.perform(patch(PATH)).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
}
