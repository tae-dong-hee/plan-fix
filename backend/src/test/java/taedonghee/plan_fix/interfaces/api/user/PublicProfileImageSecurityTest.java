package taedonghee.plan_fix.interfaces.api.user;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import taedonghee.plan_fix.application.user.ProfileImageApplicationService;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.infrastructure.security.JwtAuthenticationFilter;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.security.SecurityConfig;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = ProfileImageController.class, properties = "app.frontend-base-url=http://localhost:3000")
@Import({SecurityConfig.class, JwtAuthenticationFilter.class})
class PublicProfileImageSecurityTest {
    @TestConfiguration
    @EnableWebSecurity
    static class SecurityTestConfiguration { }

    private static final String PUBLIC_PATH = "/api/v1/users/7/profile-image";
    private static final String SELF_PATH = "/api/v1/users/me/profile-image";

    @Autowired private MockMvc mvc;
    @MockitoBean private ProfileImageApplicationService service;
    @MockitoBean private JwtTokenProvider tokenProvider;
    @MockitoBean private UserRepository users;

    @Test
    void anonymousViewerCanReadAuthorImageWithExistingResponseProtections() throws Exception {
        when(service.get(7L)).thenReturn(new ProfileImageApplicationService.ProfileImage(new byte[]{1, 2}, "image/png"));

        mvc.perform(get(PUBLIC_PATH).param("v", "image-version"))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(content().bytes(new byte[]{1, 2}))
                .andExpect(header().string("Content-Length", "2"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
        verify(service).get(7L);
    }

    @Test
    void publicImageDoesNotAllowAnonymousMutationsOrSelfProfileAccess() throws Exception {
        mvc.perform(get(SELF_PATH)).andExpect(status().isUnauthorized());
        mvc.perform(delete(SELF_PATH)).andExpect(status().isUnauthorized());
        mvc.perform(multipart(SELF_PATH).file(new MockMultipartFile("file", new byte[]{1})))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete(PUBLIC_PATH)).andExpect(status().isUnauthorized());
        mvc.perform(multipart(PUBLIC_PATH).file(new MockMultipartFile("file", new byte[]{1})))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/users/me")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void missingAuthorPhotoReturnsNotFoundToAnonymousViewers() throws Exception {
        when(service.get(7L)).thenThrow(new CoreException(ErrorType.NOT_FOUND, "등록된 프로필 사진이 없습니다."));

        mvc.perform(get(PUBLIC_PATH)).andExpect(status().isNotFound());
    }
}
