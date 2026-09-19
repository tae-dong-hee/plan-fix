package taedonghee.plan_fix.infrastructure.course;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import taedonghee.plan_fix.domain.course.*;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

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

    @Test
    void repository_json_round_trip_preserves_empty_days_and_trims_removed_days() {
        var dayConverter = new CourseDayThemesConverter();
        var storedCourse = new AtomicReference<CourseJpaEntity>();
        var storedSpots = new AtomicReference<List<CourseSpotJpaEntity>>(List.of());
        when(courses.save(any())).thenAnswer(invocation -> {
            CourseJpaEntity entity = invocation.getArgument(0);
            // Exercise the exact converter boundary used by JPA, not only in-memory domain values.
            var reloaded = CourseJpaEntity.builder()
                    .courseId(1L).userId(entity.getUserId()).title(entity.getTitle())
                    .visibility(entity.getVisibility()).status(entity.getStatus())
                    .createdAt(entity.getCreatedAt()).updatedAt(entity.getUpdatedAt())
                    .dayThemes(dayConverter.convertToEntityAttribute(
                            dayConverter.convertToDatabaseColumn(entity.getDayThemes())))
                    .build();
            storedCourse.set(reloaded);
            return reloaded;
        });
        when(spots.saveAll(any())).thenAnswer(invocation -> {
            List<CourseSpotJpaEntity> entities = invocation.getArgument(0);
            storedSpots.set(List.copyOf(entities));
            return entities;
        });
        when(spots.findByCourseIdOrderByDayNumberAscSequenceAsc(1L)).thenAnswer(invocation -> storedSpots.get());
        when(courses.findById(1L)).thenAnswer(invocation -> Optional.ofNullable(storedCourse.get()));
        var course = CourseModel.create(10L, "여행", null, null, CourseVisibility.PRIVATE, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(2L, null)), null,
                                List.of(CourseTripIdea.COAST_CAFE)),
                        new CourseDayModel(2, List.of(), null, List.of(CourseTripIdea.ACTIVITY)),
                        new CourseDayModel(3, List.of())));

        repository.save(course);
        var loaded = repository.findById(1L).orElseThrow();
        assertThat(loaded.days()).hasSize(3);
        assertThat(loaded.days().getFirst().themes()).containsExactly(CourseTravelTheme.HEALING, CourseTravelTheme.CAFE);
        assertThat(loaded.days().getFirst().tripIdeas()).containsExactly(CourseTripIdea.COAST_CAFE);
        assertThat(loaded.days().get(1).spots()).isEmpty();
        assertThat(loaded.days().get(1).tripIdeas()).containsExactly(CourseTripIdea.ACTIVITY);
        assertThat(loaded.days().get(2).spots()).isEmpty();
        assertThat(loaded.days().get(2).tripIdeas()).isEmpty();

        repository.save(loaded.update("하루 여행", null, null, null, null, null,
                List.of(new CourseDayModel(1, loaded.days().getFirst().spots()))));
        var shortened = repository.findById(1L).orElseThrow();
        assertThat(shortened.days()).hasSize(1);
        assertThat(shortened.days().getFirst().tripIdeas()).containsExactly(CourseTripIdea.COAST_CAFE);
        assertThat(storedCourse.get().getDayThemes()).hasSize(1);
    }

    @Test
    void day_converter_supports_legacy_null_and_rejects_invalid_stored_metadata() {
        var dayConverter = new CourseDayThemesConverter();
        assertThat(dayConverter.convertToEntityAttribute(null)).isEmpty();
        assertThat(dayConverter.convertToEntityAttribute(" ")).isEmpty();
        assertThat(dayConverter.convertToEntityAttribute(dayConverter.convertToDatabaseColumn(List.of()))).isEmpty();
        assertThatThrownBy(() -> dayConverter.convertToEntityAttribute("""
                [{"dayNumber":1,"tripIdeas":["UNKNOWN"]}]
                """)).isInstanceOf(RuntimeException.class);
    }
}
