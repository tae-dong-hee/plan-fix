package taedonghee.plan_fix.interfaces.api.user;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.method.annotation.AuthenticationPrincipalArgumentResolver;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import taedonghee.plan_fix.application.user.ProfileImageApplicationService;
import taedonghee.plan_fix.application.user.UserResult;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;
import taedonghee.plan_fix.support.error.GlobalExceptionHandler;

import java.time.OffsetDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProfileImageControllerTest {
    private static final String PATH = "/api/v1/users/me/profile-image";
    private final ProfileImageApplicationService service = mock(ProfileImageApplicationService.class);
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        mvc = MockMvcBuilders.standaloneSetup(new ProfileImageController(service))
                .setCustomArgumentResolvers(new AuthenticationPrincipalArgumentResolver())
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @AfterEach
    void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test
    void allImageEndpointsRequireAuthentication() throws Exception {
        mvc.perform(get(PATH)).andExpect(status().isUnauthorized());
        mvc.perform(delete(PATH)).andExpect(status().isUnauthorized());
        mvc.perform(multipart(PATH).file(new MockMultipartFile("file", new byte[]{1}))).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void uploadAndDeleteUseAuthenticatedIdentityAndReturnAvatarFields() throws Exception {
        authenticate();
        var now = OffsetDateTime.now();
        UserModel user = UserModel.reconstruct(7L, "traveler", null, null, null,
                "users/7/profile/00000000-0000-0000-0000-000000000007.png", "blue", UserRole.USER, UserStatus.ACTIVE, now, now);
        when(service.upload(eq(7L), any())).thenReturn(UserResult.from(user));
        when(service.remove(7L)).thenReturn(UserResult.from(user.updateProfileImage(null)));
        mvc.perform(multipart(PATH).file(new MockMultipartFile("file", "a.png", "image/png", new byte[]{1})))
                .andExpect(status().isOk()).andExpect(jsonPath("defaultAvatarColor").value("blue"))
                .andExpect(jsonPath("profileImageUrl").value("/api/v1/users/me/profile-image?v=00000000-0000-0000-0000-000000000007.png"));
        mvc.perform(delete(PATH)).andExpect(status().isOk())
                .andExpect(jsonPath("profileImageUrl").doesNotExist()).andExpect(jsonPath("defaultAvatarColor").value("blue"));
        verify(service).upload(eq(7L), any());
        verify(service).remove(7L);
    }

    @Test
    void imageResponseIsUncachedPrivateBytesAndAcceptsVersionQuery() throws Exception {
        authenticate();
        when(service.get(7L)).thenReturn(new ProfileImageApplicationService.ProfileImage(new byte[]{1, 2}, "image/png"));
        mvc.perform(get(PATH).param("v", "unique-version"))
                .andExpect(status().isOk()).andExpect(content().contentType(MediaType.IMAGE_PNG))
                .andExpect(content().bytes(new byte[]{1, 2})).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void missingMultipartFileIsBadRequest() throws Exception {
        authenticate();
        mvc.perform(multipart(PATH)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    private void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthenticatedUser(7L, "traveler", UserRole.USER), null, List.of()));
    }
}
