package taedonghee.plan_fix.interfaces.api.course;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import taedonghee.plan_fix.application.course.CourseApplicationService;
import taedonghee.plan_fix.domain.course.CourseGenerationSource;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;
import taedonghee.plan_fix.support.error.GlobalExceptionHandler;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CourseMetadataRequestTest {
    private final JsonMapper mapper = JsonMapper.builder().build();
    private static final String CORE = "\"title\":\"코스\",\"days\":[{\"dayNumber\":1,\"spots\":[{\"spotId\":2}]}]";

    @Test
    void json_metadata_reaches_command_without_reclassifying_source() {
        CourseRequest.Create request = mapper.readValue("{" + CORE
                + ",\"generatedBy\":\"RULE_BASED\",\"themes\":[\"CAFE\",\"HEALING\"]}", CourseRequest.Create.class);
        assertThat(request.toCommand().generatedBy()).isEqualTo(CourseGenerationSource.RULE_BASED);
        assertThat(request.toCommand().themes()).containsExactly(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING);
    }

    @Test
    void old_json_omits_metadata_and_empty_list_is_distinct_from_omission() {
        CourseRequest.Update oldRequest = mapper.readValue("{" + CORE + "}", CourseRequest.Update.class);
        assertThat(oldRequest.toCommand().generatedBy()).isNull();
        assertThat(oldRequest.toCommand().themes()).isNull();
        CourseRequest.Update emptyRequest = mapper.readValue("{" + CORE + ",\"themes\":[]}", CourseRequest.Update.class);
        assertThat(emptyRequest.toCommand().themes()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"generatedBy\":\"AI\"", "\"themes\":[\"BEACH\"]", "\"generatedBy\":1", "\"themes\":[1]"})
    void invalid_source_or_theme_is_bad_request_before_service_call(String invalidField) throws Exception {
        CourseApplicationService service = mock(CourseApplicationService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new CourseController(service))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        mvc.perform(post("/api/v1/courses").contentType(MediaType.APPLICATION_JSON)
                        .content("{" + CORE + "," + invalidField + "}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
