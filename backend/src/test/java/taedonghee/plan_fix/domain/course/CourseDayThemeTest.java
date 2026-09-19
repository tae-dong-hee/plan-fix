package taedonghee.plan_fix.domain.course;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import taedonghee.plan_fix.support.error.CoreException;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

class CourseDayThemeTest {
    @Test
    void selected_ideas_add_their_base_themes_without_duplicates_and_keep_identity() {
        var selected = new ArrayList<>(List.of(CourseTripIdea.COAST_CAFE, CourseTripIdea.NATURE));
        var day = new CourseDayTheme(1, List.of(CourseTravelTheme.CAFE), selected);
        selected.clear();
        assertThat(day.themes()).containsExactly(CourseTravelTheme.CAFE, CourseTravelTheme.HEALING);
        assertThat(day.tripIdeas()).containsExactly(CourseTripIdea.COAST_CAFE, CourseTripIdea.NATURE);
        assertThatThrownBy(() -> day.tripIdeas().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> day.themes().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 31})
    void rejects_day_numbers_outside_supported_trip_length(int dayNumber) {
        assertThatThrownBy(() -> new CourseDayTheme(dayNumber, null, null)).isInstanceOf(CoreException.class);
    }

    @Test
    void rejects_null_or_duplicate_selections() {
        assertThatThrownBy(() -> new CourseDayTheme(1, Arrays.asList(CourseTravelTheme.CAFE, null), null))
                .isInstanceOf(CoreException.class);
        assertThatThrownBy(() -> new CourseDayTheme(1, List.of(CourseTravelTheme.CAFE, CourseTravelTheme.CAFE), null))
                .isInstanceOf(CoreException.class);
        assertThatThrownBy(() -> new CourseDayTheme(1, null, Arrays.asList(CourseTripIdea.CAFE, null)))
                .isInstanceOf(CoreException.class);
        assertThatThrownBy(() -> new CourseDayTheme(1, null, List.of(CourseTripIdea.CAFE, CourseTripIdea.CAFE)))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void old_editor_preserves_each_remaining_days_intent_and_explicit_empty_clears_it() {
        var course = CourseModel.create(10L, "여행", null, null, null, null, null, List.of(
                new CourseDayModel(1, List.of(new CourseSpotModel(2L, null)), null, List.of(CourseTripIdea.ACTIVITY)),
                new CourseDayModel(2, List.of(), null, List.of(CourseTripIdea.NATURE))));

        var updated = course.update("수정", null, null, null, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(3L, null)))));
        assertThat(updated.days()).hasSize(1);
        assertThat(updated.days().getFirst().tripIdeas()).containsExactly(CourseTripIdea.ACTIVITY);
        assertThat(updated.days().getFirst().spots().getFirst().spotId()).isEqualTo(3L);
        assertThat(updated.delete().days().getFirst().tripIdeas()).containsExactly(CourseTripIdea.ACTIVITY);

        var cleared = updated.update("수정", null, null, null, null, null,
                List.of(new CourseDayModel(1, updated.days().getFirst().spots(), List.of(), List.of())));
        assertThat(cleared.days().getFirst().themes()).isEmpty();
        assertThat(cleared.days().getFirst().tripIdeas()).isEmpty();
    }
}
