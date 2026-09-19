package taedonghee.plan_fix.interfaces.api.course;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import taedonghee.plan_fix.application.course.ai.AiCourseDraftApplicationService;
import taedonghee.plan_fix.application.course.ai.CourseTheme;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;
import taedonghee.plan_fix.domain.course.CourseTripIdea;
import taedonghee.plan_fix.support.error.GlobalExceptionHandler;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AiCourseRequestTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private static final String CORE = "\"region\":\"51\",\"startDate\":\"2026-09-19\",\"endDate\":\"2026-09-20\",\"themes\":[\"FOOD\"]";

    @Test
    void legacy_request_keeps_global_theme_and_requires_no_daily_fields() {
        var command = mapper.readValue("{" + CORE + "}", AiCourseRequest.class).toCommand();
        assertThat(command.themes()).containsExactly(CourseTheme.FOOD);
        assertThat(command.dayThemes()).isEmpty();
    }

    @Test
    void daily_assignments_are_sorted_and_preserve_combined_presets_and_explicit_auto() {
        var command = mapper.readValue("{" + CORE + """
                ,"dayThemes":[{"dayNumber":2,"themes":[],"tripIdeas":[]},
                {"dayNumber":1,"tripIdeas":["COAST_CAFE","ACTIVITY"]}]}
                """, AiCourseRequest.class).toCommand();
        assertThat(command.dayThemes()).extracting(day -> day.dayNumber()).containsExactly(1, 2);
        assertThat(command.dayThemes().getFirst().tripIdeas()).containsExactly(CourseTripIdea.COAST_CAFE, CourseTripIdea.ACTIVITY);
        assertThat(command.dayThemes().getFirst().themes()).containsExactly(CourseTravelTheme.HEALING, CourseTravelTheme.CAFE, CourseTravelTheme.ACTIVITY);
        assertThat(command.dayThemes().get(1).themes()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "[{\"dayNumber\":1},{\"dayNumber\":1}]", "[{\"dayNumber\":3}]", "[{\"dayNumber\":0}]", "[null]",
            "[{\"dayNumber\":1,\"tripIdeas\":[\"UNKNOWN\"]}]", "[{\"dayNumber\":1,\"themes\":[\"BEACH\"]}]",
            "[{\"dayNumber\":1,\"tripIdeas\":[\"CAFE\",\"CAFE\"]}]", "[{\"dayNumber\":1,\"tripIdeas\":[null]}]",
            "[{\"dayNumber\":1,\"themes\":[\"CAFE\",\"CAFE\"]}]", "[{\"dayNumber\":1,\"tripIdeas\":[1]}]"
    })
    void malformed_daily_assignments_fail_before_generation(String assignments) throws Exception {
        var service = mock(AiCourseDraftApplicationService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new AiCourseController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(post("/api/v1/courses/ai/draft").contentType(MediaType.APPLICATION_JSON)
                        .content("{" + CORE + ",\"dayThemes\":" + assignments + "}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
