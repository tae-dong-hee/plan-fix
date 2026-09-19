package taedonghee.plan_fix.interfaces.api.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import taedonghee.plan_fix.application.auth.PhoneRecoveryApplicationService;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.infrastructure.security.JwtClaims;
import taedonghee.plan_fix.infrastructure.security.JwtAuthenticationFilter;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.security.SecurityConfig;
import taedonghee.plan_fix.interfaces.api.user.RecoveryPhoneController;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = {PhoneRecoveryController.class, RecoveryPhoneController.class})
@Import({SecurityConfig.class, JwtAuthenticationFilter.class})
class PhoneRecoveryControllerTest {
    @TestConfiguration @EnableWebSecurity static class SecurityTestConfiguration { }
    @Autowired MockMvc mvc;
    @Autowired WebApplicationContext webContext;
    @Autowired FilterChainProxy securityChain;
    @MockitoBean PhoneRecoveryApplicationService service;
    @MockitoBean JwtTokenProvider tokenProvider;
    @MockitoBean UserRepository users;

    @Test
    void anonymousRequestReturnsTimingAndUsesSocketPeerInsteadOfUntrustedForwardedHeader() throws Exception {
        when(service.request("FIND_ID", "01012345678", null, "127.0.0.1"))
                .thenReturn(new PhoneRecoveryApplicationService.Requested("challenge", 300, 60));
        mvc.perform(post("/api/v1/auth/phone/request").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Forwarded-For", "attacker-controlled")
                        .content("{\"purpose\":\"FIND_ID\",\"phoneNumber\":\"01012345678\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.challengeId").value("challenge"))
                .andExpect(jsonPath("$.expiresIn").value(300)).andExpect(jsonPath("$.resendAfter").value(60));
        verify(service).request("FIND_ID", "01012345678", null, "127.0.0.1");
    }

    @Test
    void verifiedIdAndResetGrantAreReturnedWithoutCaching() throws Exception {
        when(service.confirm("challenge", "123456", "127.0.0.1"))
                .thenReturn(new PhoneRecoveryApplicationService.Confirmed("FIND_ID", null, "traveler", "reset-grant"));
        mvc.perform(post("/api/v1/auth/phone/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"challengeId\":\"challenge\",\"code\":\"123456\"}"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.loginId").value("traveler"))
                .andExpect(jsonPath("$.passwordResetToken").value("reset-grant"));
    }

    @Test
    void bindingRoutesRequireAnAuthenticatedSession() throws Exception {
        mvc.perform(get("/api/v1/users/me/recovery-phone")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/users/me/recovery-phone/request").contentType(MediaType.APPLICATION_JSON)
                .content("{\"phoneNumber\":\"01012345678\",\"password\":\"Oldpass123\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/users/me/recovery-phone/confirm").contentType(MediaType.APPLICATION_JSON)
                .content("{\"challengeId\":\"challenge\",\"code\":\"123456\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void bindingUsesTheAuthenticatedUserAndReturnsOnlyAMaskedPhone() throws Exception {
        // Register the security chain once. WebMvcTest otherwise also registers
        // the JWT bean as a servlet filter before the chain and clears its context.
        MockMvc secured = MockMvcBuilders.webAppContextSetup(webContext).addFilters(securityChain).build();
        UserModel account = mock(UserModel.class);
        when(account.getUserId()).thenReturn(7L);
        when(account.getUsername()).thenReturn("traveler");
        when(account.getRole()).thenReturn(UserRole.USER);
        when(account.getStatus()).thenReturn(UserStatus.ACTIVE);
        when(tokenProvider.parse("session")).thenReturn(java.util.Optional.of(new JwtClaims(7L, "traveler", "USER")));
        when(users.findByUserId(7L)).thenReturn(java.util.Optional.of(account));
        when(service.requestBinding(7L, "01012345678", "Oldpass123", "127.0.0.1"))
                .thenReturn(new PhoneRecoveryApplicationService.Requested("challenge", 300, 60));
        when(service.confirmBinding(7L, "challenge", "123456", "127.0.0.1"))
                .thenReturn(new PhoneRecoveryApplicationService.BoundPhone("010-****-5678"));
        when(service.getBoundPhone(7L)).thenReturn(new PhoneRecoveryApplicationService.BoundPhone("010-****-5678"));

        secured.perform(post("/api/v1/users/me/recovery-phone/request").header("Authorization", "Bearer session")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"phoneNumber\":\"01012345678\",\"password\":\"Oldpass123\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.challengeId").value("challenge"));
        secured.perform(post("/api/v1/users/me/recovery-phone/confirm").header("Authorization", "Bearer session")
                        .contentType(MediaType.APPLICATION_JSON).content("{\"challengeId\":\"challenge\",\"code\":\"123456\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.phoneNumber").value("010-****-5678"));
        secured.perform(get("/api/v1/users/me/recovery-phone").header("Authorization", "Bearer session"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.phoneNumber").value("010-****-5678"));
        verify(service).requestBinding(7L, "01012345678", "Oldpass123", "127.0.0.1");
        verify(service).confirmBinding(7L, "challenge", "123456", "127.0.0.1");
    }

    @Test
    void exhaustedAndExpiredCodesHaveTheFrontendErrorContract() throws Exception {
        when(service.confirm(any(), any(), any())).thenThrow(new CoreException(ErrorType.PHONE_CODE_EXPIRED));
        mvc.perform(post("/api/v1/auth/phone/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"challengeId\":\"challenge\",\"code\":\"123456\"}"))
                .andExpect(status().isGone()).andExpect(jsonPath("$.code").value("PHONE_CODE_EXPIRED"));
        doThrow(new CoreException(ErrorType.PHONE_ATTEMPTS_EXCEEDED)).when(service).confirm(any(), any(), any());
        mvc.perform(post("/api/v1/auth/phone/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"challengeId\":\"challenge\",\"code\":\"123456\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("PHONE_ATTEMPTS_EXCEEDED"));
    }

    @Test
    void smsFailureCannotProduceASuccessOrChallenge() throws Exception {
        when(service.request(any(), any(), any(), any())).thenThrow(new CoreException(ErrorType.SERVICE_UNAVAILABLE));
        mvc.perform(post("/api/v1/auth/phone/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"SIGNUP\",\"phoneNumber\":\"01012345678\"}"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.challengeId").doesNotExist());
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void mvcDebugLogsDoNotExposePhoneOtpOrResetGrant(CapturedOutput output) throws Exception {
        when(service.request("RESET_PASSWORD", "01098765432", "privateuser", "127.0.0.1"))
                .thenReturn(new PhoneRecoveryApplicationService.Requested("sensitive-challenge", 300, 60));
        when(service.confirm("sensitive-challenge", "901234", "127.0.0.1"))
                .thenReturn(new PhoneRecoveryApplicationService.Confirmed("RESET_PASSWORD", null, null, "sensitive-reset-grant"));
        mvc.perform(post("/api/v1/auth/phone/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"RESET_PASSWORD\",\"phoneNumber\":\"01098765432\",\"loginId\":\"privateuser\"}"))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/auth/phone/confirm").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"challengeId\":\"sensitive-challenge\",\"code\":\"901234\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.passwordResetToken").value("sensitive-reset-grant"));
        assertThat(output.getAll()).doesNotContain("01098765432", "privateuser", "sensitive-challenge", "901234", "sensitive-reset-grant");
    }
}
