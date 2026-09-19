package taedonghee.plan_fix.application.course.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 배치 규칙은 화면만 봐서는 맞는지 알기 어렵고(그럴듯해 보이는 코스가 나와버린다)
 * 조용히 어긋나기 쉬워서 여기서 검증한다. DB·LLM 없이 순수 계산만 돈다.
 */
class CoursePlannerTest {

	private final CoursePlanner planner = new CoursePlanner();

	@Test
	@DisplayName("고정 장소는 후보 점수와 무관하게 반드시 코스에 포함된다")
	void anchor_is_always_included() {
		// 정보가 하나도 없어 점수가 바닥인 고정 장소
		SpotModel anchor = spot(1L, "꼭 갈 곳", "관광지", 37.80, 128.90, null, null);
		List<SpotModel> candidates = List.of(
			richSpot(2L, "인기 관광지", "관광지", 37.81, 128.91),
			richSpot(3L, "인기 음식점", "음식점", 37.82, 128.92),
			richSpot(4L, "인기 카페", "카페/음료", 37.83, 128.93)
		);

		List<List<SpotModel>> days = planner.plan(
			candidates, List.of(anchor), 1, List.of(CourseTheme.HEALING), CourseCompanion.COUPLE, Map.of());

		assertThat(days).hasSize(1);
		assertThat(days.get(0)).extracting(SpotModel::spotId).contains(1L);
	}

	@Test
	@DisplayName("멀리 떨어진 두 무리는 서로 다른 Day로 나뉜다")
	void distant_groups_are_split_into_different_days() {
		// 강릉 근처 3곳 / 춘천 근처 3곳
		List<SpotModel> candidates = List.of(
			richSpot(1L, "강릉A", "관광지", 37.80, 128.90),
			richSpot(2L, "강릉B", "음식점", 37.81, 128.91),
			richSpot(3L, "강릉C", "카페/음료", 37.79, 128.89),
			richSpot(4L, "춘천A", "관광지", 37.87, 127.73),
			richSpot(5L, "춘천B", "음식점", 37.88, 127.74),
			richSpot(6L, "춘천C", "카페/음료", 37.86, 127.72)
		);

		List<List<SpotModel>> days = planner.plan(
			candidates, List.of(), 2, List.of(CourseTheme.HEALING), CourseCompanion.COUPLE, Map.of());

		assertThat(days).hasSize(2);
		// 각 Day는 한 지역으로만 채워져야 한다
		for (List<SpotModel> day : days) {
			List<String> titles = day.stream().map(SpotModel::title).toList();
			boolean allGangneung = titles.stream().allMatch(t -> t.startsWith("강릉"));
			boolean allChuncheon = titles.stream().allMatch(t -> t.startsWith("춘천"));
			assertThat(allGangneung || allChuncheon)
				.as("한 Day에 강릉과 춘천이 섞이면 안 된다: %s", titles)
				.isTrue();
		}
	}

	@Test
	@DisplayName("하루가 식당으로만 채워지지 않는다")
	void a_day_is_not_filled_only_with_restaurants() {
		List<SpotModel> candidates = List.of(
			richSpot(1L, "식당1", "음식점", 37.80, 128.90),
			richSpot(2L, "식당2", "음식점", 37.801, 128.901),
			richSpot(3L, "식당3", "음식점", 37.802, 128.902),
			richSpot(4L, "식당4", "음식점", 37.803, 128.903),
			richSpot(5L, "관광지1", "관광지", 37.804, 128.904),
			richSpot(6L, "카페1", "카페/음료", 37.805, 128.905)
		);

		List<List<SpotModel>> days = planner.plan(
			candidates, List.of(), 1, List.of(CourseTheme.FOOD), CourseCompanion.COUPLE, Map.of());

		long restaurantCount = days.get(0).stream().filter(s -> "음식점".equals(s.category())).count();
		assertThat(restaurantCount).isLessThanOrEqualTo(2);
	}

	@Test
	@DisplayName("식사할 곳이 후보에 있으면 하루에 최소 한 곳은 넣는다")
	void each_day_gets_a_meal_when_available() {
		List<SpotModel> candidates = List.of(
			// 테마상 음식점 가중치가 낮아도 식사는 확보되어야 한다
			richSpot(1L, "관광지1", "관광지", 37.80, 128.90),
			richSpot(2L, "관광지2", "관광지", 37.801, 128.901),
			richSpot(3L, "관광지3", "관광지", 37.802, 128.902),
			richSpot(4L, "관광지4", "관광지", 37.803, 128.903),
			richSpot(5L, "식당", "음식점", 37.804, 128.904)
		);

		List<List<SpotModel>> days = planner.plan(
			candidates, List.of(), 1, List.of(CourseTheme.CULTURE), CourseCompanion.COUPLE, Map.of());

		assertThat(days.get(0)).extracting(SpotModel::category).contains("음식점");
	}

	@Test
	@DisplayName("정보가 충실한 장소가 부실한 장소보다 높은 점수를 받는다")
	void richer_metadata_scores_higher() {
		SpotModel rich = richSpot(1L, "정보 많음", "관광지", 37.80, 128.90);
		SpotModel poor = spot(2L, "정보 없음", "관광지", 37.81, 128.91, null, null);

		assertThat(planner.qualityScore(rich)).isGreaterThan(planner.qualityScore(poor));
	}

	@Test
	@DisplayName("좌표가 없는 장소는 배치에서 제외된다")
	void spots_without_coordinates_are_excluded() {
		SpotModel noCoords = SpotModel.builder()
			.spotId(9L)
			.sourceType(SpotSourceType.TOUR_API)
			.attributes(new SpotModel.SourceAttributes(
				"좌표없음", "관광지", "51", "150", "주소", null, null, "thumb.jpg", "설명".repeat(30)))
			.build();

		List<List<SpotModel>> days = planner.plan(
			List.of(noCoords, richSpot(1L, "정상", "관광지", 37.80, 128.90)),
			List.of(), 1, List.of(CourseTheme.HEALING), CourseCompanion.COUPLE, Map.of());

		assertThat(days.get(0)).extracting(SpotModel::spotId).doesNotContain(9L);
	}

	@Test
	@DisplayName("후보가 하나도 없으면 빈 Day들을 돌려준다")
	void empty_candidates_produce_empty_days() {
		List<List<SpotModel>> days = planner.plan(
			List.of(), List.of(), 3, List.of(CourseTheme.HEALING), CourseCompanion.COUPLE, Map.of());

		assertThat(days).hasSize(3);
		assertThat(days).allSatisfy(day -> assertThat(day).isEmpty());
	}

	@Test
	void anchor_without_coordinates_is_kept_even_without_candidates() {
		SpotModel anchor = SpotModel.builder().spotId(99L).sourceType(SpotSourceType.TOUR_API)
			.attributes(new SpotModel.SourceAttributes("필수 장소", "관광지", "51", "150", "주소", null, null, null, null))
			.build();
		for (List<SpotModel> candidates : List.of(List.<SpotModel>of(), List.of(richSpot(1L, "주변", "관광지", 37.8, 128.9)))) {
			List<List<SpotModel>> days = planner.plan(candidates, List.of(anchor), 1, List.of(), CourseCompanion.COUPLE, Map.of());
			assertThat(days.getFirst()).extracting(SpotModel::spotId).contains(99L);
		}
	}

	private static SpotModel richSpot(Long id, String title, String category, double lat, double lng) {
		return spot(id, title, category, lat, lng, "thumb.jpg", "충분히 긴 설명입니다. ".repeat(5));
	}

	private static SpotModel spot(
		Long id, String title, String category, double lat, double lng, String thumbnail, String description) {
		return SpotModel.builder()
			.spotId(id)
			.sourceType(SpotSourceType.TOUR_API)
			.attributes(new SpotModel.SourceAttributes(
				title, category, "51", "150", "강원특별자치도",
				BigDecimal.valueOf(lat), BigDecimal.valueOf(lng), thumbnail, description))
			.build();
	}
}
