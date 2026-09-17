package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.application.spot.SpotThumbnailResolver;
import taedonghee.plan_fix.domain.course.*;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.interfaces.api.course.CourseListResponse;
import taedonghee.plan_fix.interfaces.api.course.CourseResponse;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CourseMetadataApplicationServiceTest {
    private final CourseRepository courses = mock(CourseRepository.class);
    private final SpotRepository spots = mock(SpotRepository.class);
    private final SpotThumbnailResolver thumbnails = mock(SpotThumbnailResolver.class);
    private final CourseApplicationService service = new CourseApplicationService(courses, spots, thumbnails);
    private final AtomicReference<CourseModel> stored = new AtomicReference<>();
    private final List<CourseDayModel> days = List.of(new CourseDayModel(1, List.of(new CourseSpotModel(2L, null))));

    @BeforeEach
    void setUp() {
        when(courses.save(any())).thenAnswer(invocation -> {
            stored.set(invocation.getArgument(0));
            return stored.get();
        });
        when(courses.findById(1L)).thenAnswer(invocation -> Optional.ofNullable(stored.get()));
        when(courses.findActiveByUserId(10L)).thenAnswer(invocation -> List.of(stored.get()));
        when(spots.findAllByIdIn(any())).thenReturn(List.of(SpotModel.builder().spotId(2L)
                .sourceType(SpotSourceType.TOUR_API).title("관광지").category("관광지").build()));
    }

    @Test
    void creation_detail_and_saved_list_return_recorded_source_and_themes() {
        CourseResult created = service.create(10L, new CourseCommand.Create("AI 코스", null, null,
                CourseVisibility.PRIVATE, null, null, days, CourseGenerationSource.LLM,
                List.of(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING)));
        assertMetadata(created);
        assertMetadata(service.getMine(10L, 1L));
        assertMetadata(service.listMine(10L).getFirst());
        CourseResponse response = CourseResponse.from(created, 10L);
        assertThat(response.generatedBy()).isEqualTo(CourseGenerationSource.LLM);
        assertThat(response.themes()).containsExactly(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING);
        assertThat(response.isOwner()).isTrue();
    }

    @Test
    void metadata_omitted_from_update_and_public_conversion_survives() {
        createAi();
        assertMetadata(service.update(10L, 1L, new CourseCommand.Update("변경", null, null,
                CourseVisibility.PRIVATE, null, null, days)));
        service.ensureCoursePublicForBoard(10L, 1L);
        assertThat(stored.get().visibility()).isEqualTo(CourseVisibility.PUBLIC);
        assertMetadata(service.getCourse(null, 1L));
        CourseListResponse.Item publicItem = CourseListResponse.Item.from(CourseListResult.Item.from(stored.get()));
        assertThat(publicItem.generatedBy()).isEqualTo(CourseGenerationSource.LLM);
        assertThat(publicItem.themes()).containsExactly(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING);
    }

    @Test
    void empty_theme_list_clears_selection_and_preserves_source() {
        createAi();
        CourseResult result = service.update(10L, 1L, new CourseCommand.Update("변경", null, null,
                CourseVisibility.PRIVATE, null, null, days, null, List.of()));
        assertThat(result.generatedBy()).isEqualTo(CourseGenerationSource.LLM);
        assertThat(result.themes()).isEmpty();
    }

    private void createAi() {
        service.create(10L, new CourseCommand.Create("AI 코스", null, null,
                CourseVisibility.PRIVATE, null, null, days, CourseGenerationSource.LLM,
                List.of(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING)));
    }

    private void assertMetadata(CourseResult result) {
        assertThat(result.generatedBy()).isEqualTo(CourseGenerationSource.LLM);
        assertThat(result.themes()).containsExactly(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING);
    }
}
