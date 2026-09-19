package taedonghee.plan_fix.interfaces.api.board;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import jakarta.servlet.Filter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import taedonghee.plan_fix.application.board.BoardAiDraftApplicationService;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.infrastructure.security.JwtAuthenticationFilter;
import taedonghee.plan_fix.infrastructure.security.JwtClaims;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.security.SecurityConfig;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(controllers = BoardAiDraftController.class, properties = "app.frontend-base-url=http://localhost:3000")
@Import({SecurityConfig.class, JwtAuthenticationFilter.class})
class BoardAiDraftControllerTest {
    @TestConfiguration
    @EnableWebSecurity
    static class SecurityTestConfiguration { }

    private static final String PATH = "/api/v1/boards/ai-draft";
    @Autowired private MockMvc mvc;
    @Autowired private WebApplicationContext context;
    @Autowired @Qualifier("springSecurityFilterChain") private Filter security;
    @MockitoBean private BoardAiDraftApplicationService service;
    @MockitoBean private JwtTokenProvider tokens;
    @MockitoBean private UserRepository users;

    @BeforeEach void configureSecurityChain() {
        // Install the chain once; the JWT filter already belongs inside it.
        mvc = MockMvcBuilders.webAppContextSetup(context).addFilters(security).build();
    }

    @Test void anonymousUserCannotGenerateDrafts() throws Exception {
        mvc.perform(multipart(PATH).file(photo())).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test void authenticatedMultipartBindsAllPhotosAndContextAndDoesNotCacheDraft() throws Exception {
        authenticate();
        var photo = photo();
        var second = new MockMultipartFile("files", "two.jpg", "image/jpeg", new byte[]{2});
        when(service.generate(7L, List.of(photo, second), "여행", "바닷가", null, null))
                .thenReturn("사진에 담긴 바다예요.\n\n푸른빛이 펼쳐져요.");

        mvc.perform(multipart(PATH).file(photo).file(second).param("title", "여행").param("note", "바닷가")
                        .header("Authorization", "Bearer valid-token"))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.content").value("사진에 담긴 바다예요.\n\n푸른빛이 펼쳐져요."));
        verify(service).generate(7L, List.of(photo, second), "여행", "바닷가", null, null);
    }

    @Test void authenticatedMultipartBindsCourseAndEveryRepeatedVisitedSpotId() throws Exception {
        authenticate();
        var photo = photo();
        when(service.generate(7L, List.of(photo), "춘천여행 2박3일", "레일바이크를 탔어요", 42L, List.of(11L, 22L, 33L)))
                .thenReturn("춘천에서 레일바이크를 탔다.");

        mvc.perform(multipart(PATH).file(photo)
                        .param("title", "춘천여행 2박3일").param("note", "레일바이크를 탔어요")
                        .param("courseId", "42").param("visitedSpotIds", "11", "22", "33")
                        .header("Authorization", "Bearer valid-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").value("춘천에서 레일바이크를 탔다."));

        verify(service).generate(7L, List.of(photo), "춘천여행 2박3일", "레일바이크를 탔어요", 42L, List.of(11L, 22L, 33L));
    }

    @Test void malformedNumericCourseContextIsRejectedBeforeCallingService() throws Exception {
        authenticate();
        for (var value : List.of("not-a-number", "9223372036854775808")) {
            mvc.perform(multipart(PATH).file(photo()).param("courseId", value)
                            .header("Authorization", "Bearer valid-token"))
                    .andExpect(status().isBadRequest());
            mvc.perform(multipart(PATH).file(photo()).param("courseId", "42")
                            .param("visitedSpotIds", "11", value, "33")
                            .header("Authorization", "Bearer valid-token"))
                    .andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
    }

    @Test void filesAreRequiredButContextIsOptional() throws Exception {
        authenticate();
        mvc.perform(multipart(PATH).header("Authorization", "Bearer valid-token"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.message").isNotEmpty());
        when(service.generate(eq(7L), anyList(), isNull(), isNull(), isNull(), isNull())).thenReturn("사진으로 남긴 여행이에요.");
        mvc.perform(multipart(PATH).file(photo()).header("Authorization", "Bearer valid-token"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.content").value("사진으로 남긴 여행이에요."));
    }

    @Test void exposesFriendlyValidationQuotaAndUnavailableErrors() throws Exception {
        authenticate();
        for (var type : List.of(ErrorType.BAD_REQUEST, ErrorType.PAYLOAD_TOO_LARGE, ErrorType.TOO_MANY_REQUESTS, ErrorType.SERVICE_UNAVAILABLE)) {
            doThrow(new CoreException(type, "다시 시도해 주세요."))
                    .when(service).generate(eq(7L), anyList(), isNull(), isNull(), isNull(), isNull());
            mvc.perform(multipart(PATH).file(photo()).header("Authorization", "Bearer valid-token"))
                    .andExpect(status().is(type.getStatus().value()))
                    .andExpect(jsonPath("$.message").value("다시 시도해 주세요."));
        }
    }

    @Test void exposesForbiddenAndMissingCourseErrors() throws Exception {
        authenticate();
        for (var type : List.of(ErrorType.FORBIDDEN, ErrorType.NOT_FOUND)) {
            doThrow(new CoreException(type, "여행 코스를 확인해 주세요."))
                    .when(service).generate(eq(7L), anyList(), isNull(), isNull(), eq(42L), eq(List.of(11L, 22L)));
            mvc.perform(multipart(PATH).file(photo()).param("courseId", "42")
                            .param("visitedSpotIds", "11", "22")
                            .header("Authorization", "Bearer valid-token"))
                    .andExpect(status().is(type.getStatus().value()))
                    .andExpect(jsonPath("$.message").value("여행 코스를 확인해 주세요."));
        }
    }

    private void authenticate() {
        when(tokens.parse("valid-token")).thenReturn(Optional.of(new JwtClaims(7L, "traveler", "USER")));
        when(users.findByUserId(7L)).thenReturn(Optional.of(UserModel.reconstruct(7L, "traveler", "여행자", "trip@example.com",
                UserRole.USER, UserStatus.ACTIVE, OffsetDateTime.now(), OffsetDateTime.now())));
    }
    private static MockMultipartFile photo() { return new MockMultipartFile("files", "one.jpg", "image/jpeg", new byte[]{1}); }
}
