package taedonghee.plan_fix.domain.course;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.support.error.CoreException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CourseMetadataTest {
    private static final List<CourseDayModel> DAYS = List.of(
            new CourseDayModel(1, List.of(new CourseSpotModel(1L, null))));

    @Test
    void saved_themes_are_immutable_and_independent_of_input_list() {
        List<CourseTravelTheme> themes = new ArrayList<>(List.of(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING));
        CourseModel course = create(CourseGenerationSource.LLM, themes);
        themes.clear();
        assertThat(course.themes()).containsExactly(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING);
        assertThatThrownBy(() -> course.themes().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void old_update_and_delete_preserve_generation_metadata() {
        CourseModel original = create(CourseGenerationSource.LLM, List.of(CourseTravelTheme.CAFE));
        CourseModel updated = original.update("변경", null, null, CourseVisibility.PUBLIC, null, null, DAYS);
        assertThat(updated.generatedBy()).isEqualTo(CourseGenerationSource.LLM);
        assertThat(updated.themes()).containsExactly(CourseTravelTheme.CAFE);
        CourseModel deleted = updated.delete();
        assertThat(deleted.generatedBy()).isEqualTo(CourseGenerationSource.LLM);
        assertThat(deleted.themes()).containsExactly(CourseTravelTheme.CAFE);
    }

    @Test
    void explicit_empty_themes_clear_without_replacing_source() {
        CourseModel updated = create(CourseGenerationSource.LLM, List.of(CourseTravelTheme.CAFE))
                .update("변경", null, null, null, null, null, DAYS, null, List.of());
        assertThat(updated.generatedBy()).isEqualTo(CourseGenerationSource.LLM);
        assertThat(updated.themes()).isEmpty();
    }

    @Test
    void explicit_new_generation_replaces_old_metadata() {
        CourseModel updated = create(CourseGenerationSource.MANUAL, List.of())
                .update("새 초안", null, null, null, null, null, DAYS,
                        CourseGenerationSource.RULE_BASED, List.of(CourseTravelTheme.ACTIVITY));
        assertThat(updated.generatedBy()).isEqualTo(CourseGenerationSource.RULE_BASED);
        assertThat(updated.themes()).containsExactly(CourseTravelTheme.ACTIVITY);
    }

    @Test
    void unknown_and_manual_are_not_inferred_as_ai_from_title() {
        assertThat(create(null, null).generatedBy()).isNull();
        assertThat(create(CourseGenerationSource.MANUAL, null).generatedBy()).isEqualTo(CourseGenerationSource.MANUAL);
        assertThat(create(null, null).themes()).isEmpty();
    }

    @Test
    void null_or_duplicate_theme_entries_are_rejected() {
        assertThatThrownBy(() -> create(CourseGenerationSource.LLM, Arrays.asList(CourseTravelTheme.CAFE, null)))
                .isInstanceOf(CoreException.class);
        assertThatThrownBy(() -> create(CourseGenerationSource.LLM, List.of(CourseTravelTheme.CAFE, CourseTravelTheme.CAFE)))
                .isInstanceOf(CoreException.class);
    }

    private CourseModel create(CourseGenerationSource source, List<CourseTravelTheme> themes) {
        return CourseModel.create(10L, "속초 힐링 AI", null, null, CourseVisibility.PRIVATE,
                null, null, DAYS, source, themes);
    }
}
