package taedonghee.plan_fix.interfaces.api.user;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import taedonghee.plan_fix.domain.user.UserCredentialRepository;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class EmailSignupIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired UserCredentialRepository credentials;

    @Test
    void anonymousCheckAndSignupUseTheSamePostgresData() throws Exception {
        String loginId = uniqueLoginId();
        String email = loginId + "+trip@example.com";

        check(email, true, "사용 가능한 이메일입니다.");
        mvc.perform(post("/api/v1/users").contentType(MediaType.APPLICATION_JSON)
                        .content(signupBody(loginId, email)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email));
        assertThat(credentials.findByLoginId(loginId)).isPresent();
        check(email, false, "이미 가입된 이메일입니다.");

        String duplicateLoginId = uniqueLoginId();
        mvc.perform(post("/api/v1/users").contentType(MediaType.APPLICATION_JSON)
                        .content(signupBody(duplicateLoginId, email)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("이미 가입된 이메일입니다."));
        assertThat(credentials.findByLoginId(duplicateLoginId)).isEmpty();
        assertThat(users.existsByUsername(duplicateLoginId)).isFalse();
    }

    @Test
    void accountsWithoutLocalCredentialsAndWithdrawnUsersStillReserveTheirEmail() throws Exception {
        for (boolean withdrawn : new boolean[]{false, true}) {
            String loginId = uniqueLoginId();
            String email = loginId + "@example.com";
            UserModel user = UserModel.create(loginId, null, email);
            users.save(withdrawn ? user.withdraw() : user);
            assertThat(credentials.findByLoginId(loginId)).isEmpty();
            check(email, false, "이미 가입된 이메일입니다.");
        }
    }

    @Test
    void missingOrMalformedEmailIsRejectedInsteadOfReportedAvailable() throws Exception {
        mvc.perform(get("/api/v1/users/email-availability"))
                .andExpect(status().isBadRequest());
        for (String email : new String[]{"", " ", "invalid", "name@example.c", "a".repeat(250) + "@example.com"}) {
            mvc.perform(get("/api/v1/users/email-availability").param("email", email))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.available").doesNotExist());
        }
    }

    private void check(String email, boolean available, String message) throws Exception {
        mvc.perform(get("/api/v1/users/email-availability").param("email", email))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(available))
                .andExpect(jsonPath("$.message").value(message));
    }

    private String uniqueLoginId() {
        return "email" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private String signupBody(String loginId, String email) {
        return """
                {"loginId":"%s","password":"Password1!","name":"홍길동","email":"%s"}
                """.formatted(loginId, email);
    }
}
