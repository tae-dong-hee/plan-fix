package taedonghee.plan_fix.interfaces.api.user;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import taedonghee.plan_fix.application.user.UserApplicationService;
import taedonghee.plan_fix.application.user.UserCommand;
import taedonghee.plan_fix.application.user.UserResult;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.infrastructure.security.JwtAuthenticationFilter;
import taedonghee.plan_fix.infrastructure.security.JwtClaims;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.security.SecurityConfig;

import java.time.OffsetDateTime;
import java.util.Optional;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = UserController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class})
class UserOwnershipSecurityTest {
    private static final String UPDATE = """
            {"username":"traveler","name":null,"email":"new@example.com","birthDate":null}
            """;
    private static final String FORBIDDEN = "본인 계정만 수정하거나 탈퇴할 수 있습니다.";

    @TestConfiguration
    @EnableWebSecurity
    static class SecurityTestConfiguration { }

    @Autowired WebApplicationContext webContext;
    @Autowired FilterChainProxy securityChain;
    @MockitoBean UserApplicationService service;
    @MockitoBean JwtTokenProvider tokenProvider;
    @MockitoBean UserRepository users;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        // Register JWT through the real security chain only, not twice as a servlet filter.
        mvc = MockMvcBuilders.webAppContextSetup(webContext).addFilters(securityChain).build();
    }

    @Test
    void ownerCanUpdateTheirOwnRecoveryEmail() throws Exception {
        authenticate(UserRole.USER);
        var command = new UserCommand.Update("traveler", null, "new@example.com", null);
        when(service.update(7L, command)).thenReturn(result(UserStatus.ACTIVE));

        mvc.perform(patch("/api/v1/users/7").header("Authorization", "Bearer owner-session")
                        .contentType(MediaType.APPLICATION_JSON).content(UPDATE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(7))
                .andExpect(jsonPath("$.email").value("new@example.com"));

        verify(service).update(7L, command);
        verifyNoMoreInteractions(service);
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void authenticatedCallerCannotReplaceAnotherAccountsRecoveryEmail(UserRole role) throws Exception {
        authenticate(role);

        mvc.perform(patch("/api/v1/users/42").header("Authorization", "Bearer owner-session")
                        .contentType(MediaType.APPLICATION_JSON).content(UPDATE))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(FORBIDDEN));

        verifyNoInteractions(service);
    }

    @Test
    void anonymousCallerCannotUpdateAnyAccount() throws Exception {
        mvc.perform(patch("/api/v1/users/7").contentType(MediaType.APPLICATION_JSON).content(UPDATE))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(service);
    }

    @Test
    void ownerCanWithdrawTheirOwnAccount() throws Exception {
        authenticate(UserRole.USER);
        when(service.withdraw(7L)).thenReturn(result(UserStatus.WITHDRAWN));

        mvc.perform(delete("/api/v1/users/7").header("Authorization", "Bearer owner-session"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(7))
                .andExpect(jsonPath("$.status").value("WITHDRAWN"));

        verify(service).withdraw(7L);
        verifyNoMoreInteractions(service);
    }

    @ParameterizedTest
    @EnumSource(UserRole.class)
    void authenticatedCallerCannotWithdrawAnotherAccount(UserRole role) throws Exception {
        authenticate(role);

        mvc.perform(delete("/api/v1/users/42").header("Authorization", "Bearer owner-session"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(FORBIDDEN));

        verifyNoInteractions(service);
    }

    @Test
    void anonymousCallerCannotWithdrawAnyAccount() throws Exception {
        mvc.perform(delete("/api/v1/users/7"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(service);
    }

    private void authenticate(UserRole role) {
        var account = mock(UserModel.class);
        when(account.getUserId()).thenReturn(7L);
        when(account.getUsername()).thenReturn("traveler");
        when(account.getRole()).thenReturn(role);
        when(account.getStatus()).thenReturn(UserStatus.ACTIVE);
        when(tokenProvider.parse("owner-session")).thenReturn(Optional.of(new JwtClaims(7L, "traveler", role.name())));
        when(users.findByUserId(7L)).thenReturn(Optional.of(account));
    }

    private UserResult result(UserStatus status) {
        return new UserResult(7L, "traveler", null, "new@example.com", null, null,
                "violet", UserRole.USER, status, OffsetDateTime.now(), OffsetDateTime.now());
    }
}
