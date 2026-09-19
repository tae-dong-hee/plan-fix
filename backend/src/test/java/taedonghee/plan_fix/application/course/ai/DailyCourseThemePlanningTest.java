package taedonghee.plan_fix.application.course.ai;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.course.CourseDayTheme;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;
import taedonghee.plan_fix.domain.course.CourseTripIdea;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class DailyCourseThemePlanningTest {
    private final CoursePlanner planner = new CoursePlanner();

    @Test
    void swapping_daily_themes_moves_the_matching_places_to_the_requested_date() {
        List<SpotModel> candidates = List.of(
                spot(1, "커피", "카페/음료", 128.9), spot(2, "디저트", "카페/음료", 128.901),
                spot(3, "서핑", "레포츠", 127.7), spot(4, "카약", "레포츠", 127.701));
        var cafeFirst = plan(candidates, List.of(day(1, CourseTripIdea.CAFE), day(2, CourseTripIdea.ACTIVITY)));
        var activityFirst = plan(candidates, List.of(day(1, CourseTripIdea.ACTIVITY), day(2, CourseTripIdea.CAFE)));

        assertThat(cafeFirst.get(0)).extracting(SpotModel::spotId).containsExactlyInAnyOrder(1L, 2L);
        assertThat(cafeFirst.get(1)).extracting(SpotModel::spotId).containsExactlyInAnyOrder(3L, 4L);
        assertThat(activityFirst.get(0)).extracting(SpotModel::spotId).containsExactlyInAnyOrder(3L, 4L);
        assertThat(activityFirst.get(1)).extracting(SpotModel::spotId).containsExactlyInAnyOrder(1L, 2L);
    }

    @Test
    void combined_coast_and_activity_preferences_include_sea_cafe_and_sport_when_nearby() {
        var combined = new CourseDayTheme(1, List.of(), List.of(CourseTripIdea.COAST_CAFE, CourseTripIdea.ACTIVITY));
        var result = plan(List.of(spot(1, "박물관", "관광지", 128.90),
                spot(2, "경포해변", "관광지", 128.901), spot(3, "커피집", "카페/음료", 128.902),
                spot(4, "서핑장", "레포츠", 128.903), spot(5, "식당", "음식점", 128.904)), List.of(combined));

        assertThat(result.getFirst()).extracting(SpotModel::spotId).containsExactlyInAnyOrder(2L, 3L, 4L, 5L);
    }

    @Test
    void culture_local_uses_culture_and_actual_alley_or_market_evidence() {
        var result = plan(List.of(spot(1, "박물관", "문화시설", 128.9),
                spot(2, "중앙시장 골목", "쇼핑", 128.901), spot(3, "미술관", "문화시설", 128.902),
                spot(4, "공연장", "문화시설", 128.903), spot(5, "식당", "음식점", 128.904)),
                List.of(day(1, CourseTripIdea.CULTURE_LOCAL)));
        assertThat(result.getFirst()).extracting(SpotModel::spotId).contains(2L);
        assertThat(result.getFirst()).extracting(SpotModel::category).contains("문화시설", "음식점");
    }

    @Test
    void anchors_are_kept_without_duplicate_spots_or_forcing_a_distant_theme_match() {
        SpotModel anchor = spot(9, "고정 장소", "관광지", 128.9);
        var result = planner.plan(List.of(spot(1, "근처 식당", "음식점", 128.901),
                        spot(2, "먼 서핑장", "레포츠", 127.7)), List.of(anchor), 2, List.of(),
                CourseCompanion.COUPLE, Map.of(), List.of(day(1, CourseTripIdea.ACTIVITY), day(2, CourseTripIdea.ACTIVITY)));
        assertThat(result.get(0)).extracting(SpotModel::spotId).contains(9L).doesNotContain(2L);
        assertThat(result.stream().flatMap(List::stream).map(SpotModel::spotId)).doesNotHaveDuplicates();
        assertThat(result.get(1)).extracting(SpotModel::spotId).contains(2L);
    }

    @Test
    void cafe_and_restaurant_names_do_not_count_as_actual_sea_nature_or_walk_spots() {
        SpotModel restaurant = spot(1, "바다횟집 숲 정원 산책", "음식점", 128.9);
        SpotModel cafe = spot(2, "오션뷰 숲카페", "카페/음료", 128.901);
        for (CourseTripIdea idea : List.of(CourseTripIdea.COAST_CAFE, CourseTripIdea.NATURE, CourseTripIdea.FOOD_WALK)) {
            assertThat(DailyThemePreferences.requirements(day(1, idea)).stream()
                    .filter(requirement -> List.of("바다", "자연", "산책").contains(requirement.key())))
                    .allSatisfy(requirement -> {
                        assertThat(requirement.matches(restaurant)).isFalse();
                        assertThat(requirement.matches(cafe)).isFalse();
                    });
        }
    }

    @Test
    void earlier_generic_day_preserves_the_only_sports_spot_for_later_activity_day() {
        var result = plan(List.of(spot(1, "공원", "관광지", 128.9), spot(2, "서핑", "레포츠", 128.901),
                        spot(3, "쇼핑1", "쇼핑", 128.902), spot(4, "쇼핑2", "쇼핑", 128.903),
                        spot(5, "쇼핑3", "쇼핑", 128.904), spot(6, "식당", "음식점", 128.905)),
                List.of(new CourseDayTheme(1, List.of(CourseTravelTheme.HEALING), List.of()), day(2, CourseTripIdea.ACTIVITY)));
        assertThat(result.get(0)).extracting(SpotModel::spotId).doesNotContain(2L);
        assertThat(result.get(1)).extracting(SpotModel::spotId).contains(2L);
        assertThat(result.stream().flatMap(List::stream).map(SpotModel::spotId)).doesNotHaveDuplicates();
    }

    @Test
    void a_single_available_slot_prioritizes_the_selected_theme_over_a_meal() {
        var result = plan(List.of(spot(1, "식당", "음식점", 128.9), spot(2, "서핑", "레포츠", 128.901)),
                List.of(day(1, CourseTripIdea.ACTIVITY), new CourseDayTheme(2, List.of(), List.of())));
        assertThat(result.get(0)).extracting(SpotModel::spotId).containsExactly(2L);
        assertThat(result.get(1)).extracting(SpotModel::spotId).containsExactly(1L);
    }

    @Test
    void auto_and_unassigned_days_do_not_inherit_global_preferences_when_daily_mode_is_present() {
        var daily = DailyThemePreferences.resolve(List.of(CourseTheme.FOOD),
                List.of(day(1, CourseTripIdea.CAFE), new CourseDayTheme(2, List.of(), List.of())), 3);
        assertThat(daily.get(0).themes()).containsExactly(CourseTravelTheme.CAFE);
        assertThat(daily.get(1).themes()).isEmpty();
        assertThat(daily.get(2).themes()).isEmpty();
        assertThat(DailyThemePreferences.resolve(List.of(CourseTheme.FOOD), List.of(), 2))
                .allSatisfy(day -> assertThat(day.themes()).containsExactly(CourseTravelTheme.FOOD));
    }

    @Test
    void llm_prompt_expresses_daily_presets_and_explicit_auto_instead_of_global_union() {
        var prompt = new AiCourseLlmPlanner(null).buildPrompt(List.of(spot(1, "해변", "관광지", 128.9)),
                List.of(), 3, List.of(CourseTheme.FOOD), CourseCompanion.COUPLE,
                List.of(day(1, CourseTripIdea.COAST_CAFE), day(2, CourseTripIdea.CULTURE_LOCAL),
                        new CourseDayTheme(3, List.of(), List.of())));
        assertThat(prompt).contains("DAY 1: 바다와 카페", "DAY 2: 문화와 골목 여행", "DAY 3: AI에게 맡기기",
                "해변·해안·바다", "골목·시장·마을", "특성: 바다");
        assertThat(prompt).doesNotContain("- 테마: 맛집 탐방");
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(doubles = {128.901, 127.7})
    void llm_plan_with_swapped_themes_is_replanned_even_when_correct_themes_are_in_another_neighborhood(double activityLongitude) {
        List<SpotModel> candidates = List.of(spot(1, "커피", "카페/음료", 128.9),
                spot(2, "서핑", "레포츠", activityLongitude));
        var wrong = new LlmCoursePlan(List.of(new LlmCoursePlan.Day(1, List.of(new LlmCoursePlan.Entry(2L, "서핑"))),
                new LlmCoursePlan.Day(2, List.of(new LlmCoursePlan.Entry(1L, "커피")))));
        var correct = new LlmCoursePlan(List.of(new LlmCoursePlan.Day(1, List.of(new LlmCoursePlan.Entry(1L, "커피"))),
                new LlmCoursePlan.Day(2, List.of(new LlmCoursePlan.Entry(2L, "서핑")))));
        var validator = new AiCoursePlanValidator();
        var preferences = List.of(day(1, CourseTripIdea.CAFE), day(2, CourseTripIdea.ACTIVITY));
        assertThat(validator.validate(wrong, candidates, List.of(), 2, preferences)).isEmpty();
        assertThat(validator.validate(correct, candidates, List.of(), 2, preferences)).isPresent();
    }

    private List<List<SpotModel>> plan(List<SpotModel> candidates, List<CourseDayTheme> assignments) {
        return planner.plan(candidates, List.of(), assignments.size(), List.of(), CourseCompanion.COUPLE, Map.of(), assignments);
    }

    static CourseDayTheme day(int number, CourseTripIdea idea) { return new CourseDayTheme(number, List.of(), List.of(idea)); }

    static SpotModel spot(long id, String title, String category, double longitude) {
        return SpotModel.builder().spotId(id).sourceType(SpotSourceType.TOUR_API)
                .title(title).category(category).thumbnail("photo.jpg").description("장소 설명입니다. ".repeat(10))
                .address("강원특별자치도").latitude(new BigDecimal("37.8"))
                .longitude(BigDecimal.valueOf(longitude)).build();
    }
}
