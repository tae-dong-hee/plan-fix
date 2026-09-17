package taedonghee.plan_fix.infrastructure.course;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import taedonghee.plan_fix.domain.course.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CourseMetadataPersistenceTest {
    private final CourseJpaRepository courses = mock(CourseJpaRepository.class);
    private final CourseSpotJpaRepository spots = mock(CourseSpotJpaRepository.class);
    private final CourseRepositoryImpl repository = new CourseRepositoryImpl(courses, spots);
    private final CourseThemesConverter converter = new CourseThemesConverter();

    @ParameterizedTest
    @EnumSource(CourseGenerationSource.class)
    void repository_save_round_trip_preserves_each_generation_source(CourseGenerationSource source) {
        when(courses.save(any())).thenAnswer(invocation -> {
            CourseJpaEntity entity = invocation.getArgument(0);
            assertThat(entity.getGeneratedBy()).isEqualTo(source);
            assertThat(entity.getThemes()).containsExactly(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING);
            return entity;
        });
        when(spots.findByCourseIdOrderByDayNumberAscSequenceAsc(1L)).thenReturn(List.of(
                CourseSpotJpaEntity.builder().courseId(1L).spotId(2L).dayNumber(1).sequence(0).build()));
        OffsetDateTime now = OffsetDateTime.now();
        CourseModel course = CourseModel.reconstruct(1L, 10L, "코스", null, null, CourseVisibility.PUBLIC,
                CourseStatus.ACTIVE, 0, 0, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(2L, null)))), now, now,
                source, List.of(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING));

        CourseModel saved = repository.save(course);
        assertThat(saved.generatedBy()).isEqualTo(source);
        assertThat(saved.themes()).containsExactly(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING);
    }

    @Test
    void legacy_record_with_ai_in_title_remains_unknown_on_read() {
        OffsetDateTime now = OffsetDateTime.now();
        when(courses.findById(1L)).thenReturn(Optional.of(CourseJpaEntity.builder()
                .courseId(1L).userId(10L).title("속초 힐링 AI")
                .visibility(CourseVisibility.PUBLIC).status(CourseStatus.ACTIVE)
                .createdAt(now).updatedAt(now).build()));
        when(spots.findByCourseIdOrderByDayNumberAscSequenceAsc(1L)).thenReturn(List.of(
                CourseSpotJpaEntity.builder().courseId(1L).spotId(2L).dayNumber(1).sequence(0).build()));
        CourseModel restored = repository.findById(1L).orElseThrow();
        assertThat(restored.generatedBy()).isNull();
        assertThat(restored.themes()).isEmpty();
    }

    @Test
    void database_converter_round_trip_preserves_all_themes_in_order() {
        List<CourseTravelTheme> themes = List.of(CourseTravelTheme.values());
        String stored = converter.convertToDatabaseColumn(themes);
        assertThat(converter.convertToEntityAttribute(stored)).containsExactlyElementsOf(themes);
        assertThat(converter.convertToEntityAttribute(null)).isEmpty();
        assertThat(converter.convertToEntityAttribute(converter.convertToDatabaseColumn(List.of()))).isEmpty();
    }

    @Test
    void database_converter_rejects_unrecognized_stored_theme() {
        assertThatThrownBy(() -> converter.convertToEntityAttribute("CAFE,UNKNOWN"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
