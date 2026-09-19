package taedonghee.plan_fix.application.course.ai;

import taedonghee.plan_fix.domain.course.CourseDayTheme;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;
import taedonghee.plan_fix.domain.course.CourseTripIdea;
import taedonghee.plan_fix.domain.spot.SpotModel;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.Predicate;
import java.util.stream.IntStream;

/** Shared daily intent for candidate ranking, the prompt and result validation. */
final class DailyThemePreferences {
	private DailyThemePreferences() { }

	static List<CourseDayTheme> resolve(List<CourseTheme> global, List<CourseDayTheme> assignments, int dayCount) {
		List<CourseTravelTheme> legacy = global.stream().map(t -> CourseTravelTheme.valueOf(t.name())).toList();
		return IntStream.rangeClosed(1, dayCount).mapToObj(day -> assignments.stream()
			.filter(it -> it.dayNumber() == day).findFirst()
			.orElseGet(() -> new CourseDayTheme(day, assignments.isEmpty() ? legacy : List.of(), List.of()))).toList();
	}

	static List<CourseTheme> themes(CourseDayTheme day) {
		return day.themes().stream().map(t -> CourseTheme.valueOf(t.name())).toList();
	}

	static List<Requirement> requirements(CourseDayTheme day) {
		var requirements = new LinkedHashMap<String, Requirement>();
		for (CourseTripIdea idea : day.tripIdeas()) {
			switch (idea) {
				case COAST_CAFE -> { add(requirements, coast()); add(requirements, category("카페/음료")); }
				case FOOD_WALK -> { add(requirements, category("음식점")); add(requirements, walk()); }
				case NATURE -> add(requirements, nature());
				case ACTIVITY -> add(requirements, activity());
				case CULTURE_LOCAL -> { add(requirements, culture()); add(requirements, local()); }
				case CAFE -> add(requirements, category("카페/음료"));
			}
		}
		List<CourseTravelTheme> covered = day.tripIdeas().stream().flatMap(idea -> idea.themes().stream()).toList();
		for (CourseTravelTheme theme : day.themes()) {
			if (covered.contains(theme)) continue;
			add(requirements, switch (theme) {
				case HEALING -> category("관광지");
				case FOOD -> category("음식점");
				case CAFE -> category("카페/음료");
				case ACTIVITY -> activity();
				case CULTURE -> culture();
			});
		}
		return List.copyOf(requirements.values());
	}

	static double semanticBonus(SpotModel spot, CourseDayTheme day) {
		return requirements(day).stream().filter(r -> r.matches(spot)).count() * 1.5;
	}

	static String describe(CourseDayTheme day) {
		List<String> labels = new ArrayList<>();
		for (CourseTripIdea idea : day.tripIdeas()) {
			labels.add(idea.label() + switch (idea) {
				case COAST_CAFE -> " (해변·해안·바다 장소와 카페)";
				case FOOD_WALK -> " (음식점과 가까운 산책 장소)";
				case NATURE -> " (숲·공원·호수 등 자연 풍경)";
				case ACTIVITY -> " (레포츠·체험 등 몸을 움직이는 장소)";
				case CULTURE_LOCAL -> " (문화·역사 장소와 골목·시장·마을)";
				case CAFE -> " (카페·커피·디저트 장소)";
			});
		}
		if (!day.themes().isEmpty()) labels.add("취향: " + day.themes());
		return labels.isEmpty() ? "AI에게 맡기기 (이 날짜에는 지정된 테마 없음)" : String.join(", ", labels);
	}

	private static void add(LinkedHashMap<String, Requirement> values, Requirement requirement) {
		values.putIfAbsent(requirement.key(), requirement);
	}
	private static Requirement category(String name) {
		return new Requirement(name, spot -> name.equals(spot.category()));
	}
	private static Requirement coast() {
		return new Requirement("바다", spot -> outdoor(spot) && keywords(spot, "바다", "해변", "해수욕", "해안", "항구", "방파제", "등대", "오션"));
	}
	private static Requirement walk() {
		return new Requirement("산책", spot -> outdoor(spot) && keywords(spot, "산책", "공원", "둘레길", "해변", "호수", "수목원", "정원", "거리", "골목"));
	}
	private static Requirement nature() {
		return new Requirement("자연", spot -> outdoor(spot) && keywords(spot, "숲", "자연", "공원", "호수", "수목원", "휴양림", "계곡", "폭포", "해변", "해수욕", "산책", "정원", "습지"));
	}
	private static Requirement activity() {
		return new Requirement("액티비티", spot -> "레포츠".equals(spot.category()) || outdoor(spot) && keywords(spot, "서핑", "래프팅", "레일바이크", "짚라인", "카약", "패러글라이딩", "클라이밍", "승마"));
	}
	private static Requirement culture() {
		return new Requirement("문화", spot -> "문화시설".equals(spot.category()) || outdoor(spot) && keywords(spot, "박물관", "미술관", "문화", "유적", "고택", "사찰", "역사"));
	}
	private static Requirement local() {
		return new Requirement("골목", spot -> (outdoor(spot) || "쇼핑".equals(spot.category()) || "문화시설".equals(spot.category()))
			&& keywords(spot, "골목", "시장", "거리", "마을", "상점", "전통"));
	}
	private static boolean outdoor(SpotModel spot) {
		return spot.category() == null || spot.category().isBlank() || "기타".equals(spot.category())
			|| "관광지".equals(spot.category()) || "레포츠".equals(spot.category());
	}
	private static boolean keywords(SpotModel spot, String... words) {
		String text = (spot.title() == null ? "" : spot.title()) + " " + (spot.description() == null ? "" : spot.description());
		for (String word : words) if (text.contains(word)) return true;
		return false;
	}

	record Requirement(String key, Predicate<SpotModel> predicate) {
		boolean matches(SpotModel spot) { return predicate.test(spot); }
	}
}
