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
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import taedonghee.plan_fix.application.auth.*;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.infrastructure.security.*;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = IdRecoveryController.class)
@Import({SecurityConfig.class, JwtAuthenticationFilter.class})
class IdRecoveryControllerTest {
    @TestConfiguration @EnableWebSecurity static class SecurityTestConfiguration { }
    @Autowired MockMvc mvc;
    @MockitoBean IdRecoveryApplicationService service;
    @MockitoBean RecoveryRequestLimiter limits;
    @MockitoBean JwtTokenProvider tokens;
    @MockitoBean UserRepository users;

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void acceptedEmailNeverReturnsOrLogsTheAccountId(CapturedOutput output) throws Exception {
        var receipt = new IdRecoveryMail("private@example.com", List.of("private-login-id"));
        receipt.markAccepted();
        when(service.request("private@example.com")).thenReturn(receipt);
        mvc.perform(post("/api/v1/auth/id-recovery/request").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Forwarded-For", "attacker-supplied-address")
                        .content("{\"email\":\"private@example.com\"}"))
                .andExpect(status().isNoContent()).andExpect(content().string(""))
                .andExpect(header().string("Cache-Control", "no-store"));
        verify(limits).acquireRequest("127.0.0.1");
        assertThat(output.getAll()).doesNotContain("private@example.com", "private-login-id");
    }

    @Test
    void unknownEmailHasTheClearMismatchContract() throws Exception {
        when(service.request(any())).thenThrow(new CoreException(ErrorType.RECOVERY_EMAIL_MISMATCH));
        mvc.perform(post("/api/v1/auth/id-recovery/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"unknown@example.com\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("RECOVERY_EMAIL_MISMATCH"))
                .andExpect(jsonPath("$.message").value("등록된 이메일이 일치하지 않습니다. 가입한 이메일을 확인해 주세요."));
    }

    @Test
    void smtpFailureCannotReturnSuccess() throws Exception {
        when(service.request(any())).thenReturn(new IdRecoveryMail("private@example.com", List.of("private-login-id")));
        mvc.perform(post("/api/v1/auth/id-recovery/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"private@example.com\"}"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.loginId").doesNotExist());
    }

    @Test
    void perEmailAndSharedPeerQuotaErrorsCannotBecomeSuccess() throws Exception {
        when(service.request(any())).thenThrow(new CoreException(ErrorType.TOO_MANY_REQUESTS));
        mvc.perform(post("/api/v1/auth/id-recovery/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"private@example.com\"}"))
                .andExpect(status().isTooManyRequests());
        clearInvocations(service);
        doThrow(new CoreException(ErrorType.TOO_MANY_REQUESTS)).when(limits).acquireRequest(any());
        mvc.perform(post("/api/v1/auth/id-recovery/request").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"another@example.com\"}"))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(service);
    }

    @Test
    void onlyTheRequestEndpointIsPublicAndRemovedSmsRoutesAreNotExposed() throws Exception {
        mvc.perform(get("/api/v1/auth/id-recovery/request")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/phone/request")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/auth/phone/confirm")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/users/me/recovery-phone/request")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }
}
