package taedonghee.plan_fix.application.course.ai;

import dev.langchain4j.model.chat.ChatLanguageModel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.course.CourseDayTheme;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * [application] 후보 목록을 주고 LLM에게 Day별 배치를 맡긴다.
 *
 * LLM에게 DB 전체를 주지 않는다. 규칙 기반 점수로 추린 후보만 넘기고, 그 목록의
 * id 외에는 쓰지 못하게 제약한다. 그래도 지어내는 경우가 있어서 결과는
 * {@link AiCoursePlanValidator}가 다시 검증한다.
 *
 * 응답 형식으로 JSON 대신 줄 단위 포맷을 쓴다. 코드펜스·후행 쉼표·설명 문장이
 * 섞여 들어와도 줄 단위면 망가진 줄만 건너뛰면 되지만, JSON은 한 글자만 어긋나도
 * 응답 전체를 잃는다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AiCourseLlmPlanner {

	private static final int MAX_CANDIDATES_IN_PROMPT = 60;
	/** 줄 앞에 붙는 목록 기호("- ", "* ", "1. ", "1) ")를 떼어낸다. */
	private static final Pattern LIST_MARKER = Pattern.compile("^\\s*(?:[-*•]|\\d+[.)])\\s+");
	private static final Pattern LEADING_NUMBER = Pattern.compile("^\\s*(\\d+)");

	private final ObjectProvider<ChatLanguageModel> chatLanguageModelProvider;

	/**
	 * @return 배치 결과. 모델이 없거나 호출·파싱에 실패하면 비어 있다(호출부가 규칙 기반으로 폴백).
	 */
	public Optional<LlmCoursePlan> plan(
		List<SpotModel> candidates,
		List<SpotModel> anchors,
		int dayCount,
		List<CourseTheme> themes,
		CourseCompanion companion
	) {
		return plan(candidates, anchors, dayCount, themes, companion, List.of());
	}

	public Optional<LlmCoursePlan> plan(
		List<SpotModel> candidates, List<SpotModel> anchors, int dayCount,
		List<CourseTheme> themes, CourseCompanion companion, List<CourseDayTheme> dayThemes
	) {
		ChatLanguageModel model = chatLanguageModelProvider.getIfAvailable();
		if (model == null) {
			log.info("[AI 코스] Gemini 모델이 설정되지 않아 규칙 기반으로 진행합니다.");
			return Optional.empty();
		}
		if (candidates.isEmpty()) {
			return Optional.empty();
		}

		String prompt = buildPrompt(candidates, anchors, dayCount, themes, companion, dayThemes);
		try {
			String response = model.chat(prompt);
			LlmCoursePlan plan = parse(response, dayCount);
			if (plan.isEmpty()) {
				log.warn("[AI 코스] LLM 응답에서 배치를 읽지 못했습니다. 규칙 기반으로 폴백합니다.");
				return Optional.empty();
			}
			return Optional.of(plan);
		} catch (Exception e) {
			// 추천이 안 되는 것보다 규칙 기반이라도 나오는 게 낫다.
			log.warn("[AI 코스] LLM 호출 실패, 규칙 기반으로 폴백합니다. {}", e.getMessage());
			return Optional.empty();
		}
	}

	String buildPrompt(
		List<SpotModel> candidates, List<SpotModel> anchors, int dayCount,
		List<CourseTheme> themes, CourseCompanion companion, List<CourseDayTheme> dayThemes) {

		List<SpotModel> trimmed = candidates.size() > MAX_CANDIDATES_IN_PROMPT
			? candidates.subList(0, MAX_CANDIDATES_IN_PROMPT)
			: candidates;

		StringBuilder sb = new StringBuilder();
		sb.append("당신은 강원도 여행 코스를 짜는 플래너입니다.\n\n");
		sb.append("[여행 조건]\n");
		sb.append("- 기간: ").append(dayCount).append("일\n");
		sb.append("- 동행: ").append(describeCompanion(companion)).append('\n');
		if (dayThemes.isEmpty()) sb.append("- 테마: ").append(describeThemes(themes)).append('\n');
		sb.append("- 하루 방문 장소 수: ").append(companion.spotsPerDay()).append("곳 내외\n\n");
		List<CourseDayTheme> daily = DailyThemePreferences.resolve(themes, dayThemes, dayCount);
		if (!dayThemes.isEmpty()) {
			sb.append("[날짜별 테마 — 각 날짜의 장소 선택에 적용]\n");
			for (CourseDayTheme day : daily) sb.append("DAY ").append(day.dayNumber()).append(": ")
				.append(DailyThemePreferences.describe(day)).append('\n');
			sb.append("테마가 여러 개면 가능한 범위에서 각각 맞는 장소를 포함하세요. 날짜끼리 테마를 바꾸지 마세요.\n")
				.append("AI에게 맡긴 날은 별도 테마 없이 구성하세요. 테마 장소가 없으면 가까운 후보로 구성하고 없는 특성을 지어내지 마세요.\n\n");
		}

		if (!anchors.isEmpty()) {
			sb.append("[반드시 포함할 장소]\n");
			anchors.forEach(anchor ->
				sb.append("- ").append(anchor.spotId()).append(" | ").append(anchor.title()).append('\n'));
			sb.append('\n');
		}

		sb.append("[후보 장소 목록] (id | 이름 | 카테고리 | 위도,경도)\n");
		for (SpotModel spot : trimmed) {
			sb.append(spot.spotId()).append(" | ")
				.append(spot.title()).append(" | ")
				.append(spot.category()).append(" | ")
				.append(spot.latitude()).append(',').append(spot.longitude())
				.append(" | 특성: ").append(daily.stream().flatMap(day -> DailyThemePreferences.requirements(day).stream())
					.filter(requirement -> requirement.matches(spot)).map(DailyThemePreferences.Requirement::key)
					.distinct().collect(java.util.stream.Collectors.joining(", ")))
				.append('\n');
		}

		sb.append("""

			[규칙]
			1. 후보 목록에 있는 id만 사용하세요. 목록에 없는 장소를 만들어내면 안 됩니다.
			2. 반드시 포함할 장소는 빠뜨리지 마세요.
			3. 같은 날에 배치하는 장소들은 좌표상 서로 가까워야 합니다. 하루 안에서 멀리 이동하지 않게 하세요.
			4. 하루에 식사할 음식점을 1곳 넣되, 2곳을 넘기지 마세요.
			5. 테마는 여행의 분위기이지 장소 카테고리 하나만 고르라는 뜻이 아닙니다.
			   FOOD/맛집 테마라도 음식점은 하루 1~2곳만 넣고, 나머지는 음식점 근처의
			   관광지·카페·문화시설을 섞어 실제 여행 일정처럼 구성하세요.
			6. 같은 장소를 두 번 이상 넣지 마세요.
			7. 이유는 한 문장으로, 여행자에게 말하듯 자연스럽게 쓰세요.
			8. 방문 순서는 서버에서 실제 자동차 도로거리로 다시 정렬합니다.
			   이유는 장소의 매력을 설명하고, 아침·점심·마지막 방문처럼 시간이나 순서를 단정하지 마세요.

			[출력 형식] 아래 형식만 출력하세요. 다른 설명이나 코드블록은 넣지 마세요.
			DAY 1
			101 | 첫날 도착해서 바로 가기 좋은 바다예요
			205 | 해변에서 걸어갈 수 있는 카페예요
			DAY 2
			310 | 아침 산책하기 좋은 호수예요
			""");

		return sb.toString();
	}

	/**
	 * "DAY n" 줄로 날짜를 구분하고, "id | 이유" 줄을 항목으로 읽는다.
	 * 형식에 맞지 않는 줄은 조용히 건너뛴다(모델이 앞뒤에 설명을 붙이는 일이 잦다).
	 */
	LlmCoursePlan parse(String response, int dayCount) {
		List<LlmCoursePlan.Day> days = new ArrayList<>();
		List<LlmCoursePlan.Entry> current = null;
		int currentDay = 0;

		for (String rawLine : response.split("\\R")) {
			String line = rawLine.strip();
			if (line.isEmpty() || line.startsWith("```")) {
				continue;
			}

			Integer dayNumber = parseDayHeader(line);
			if (dayNumber != null) {
				if (current != null) {
					days.add(new LlmCoursePlan.Day(currentDay, current));
				}
				currentDay = dayNumber;
				current = new ArrayList<>();
				continue;
			}

			if (current == null) {
				continue;
			}
			parseEntry(line).ifPresent(current::add);
		}

		if (current != null) {
			days.add(new LlmCoursePlan.Day(currentDay, current));
		}

		// 요청한 일수보다 많이 만들어냈으면 잘라낸다.
		List<LlmCoursePlan.Day> limited = days.stream()
			.filter(day -> day.dayNumber() >= 1 && day.dayNumber() <= dayCount)
			.toList();

		return new LlmCoursePlan(limited);
	}

	private Integer parseDayHeader(String line) {
		String upper = line.toUpperCase();
		if (!upper.startsWith("DAY")) {
			return null;
		}
		String digits = upper.replaceAll("[^0-9]", "");
		if (digits.isEmpty()) {
			return null;
		}
		try {
			return Integer.parseInt(digits);
		} catch (NumberFormatException e) {
			return null;
		}
	}

	private Optional<LlmCoursePlan.Entry> parseEntry(String line) {
		int separator = line.indexOf('|');
		String idPart = (separator < 0 ? line : line.substring(0, separator)).strip();

		// "- 101", "1. 205" 처럼 목록 기호를 붙이는 경우가 있다. 숫자만 남기는 식으로 처리하면
		// "2. 205"가 2205가 되어 전혀 다른 장소를 가리키게 되므로, 목록 기호를 먼저 떼어낸다.
		String cleaned = LIST_MARKER.matcher(idPart).replaceFirst("");
		Matcher matcher = LEADING_NUMBER.matcher(cleaned);
		if (!matcher.find()) {
			return Optional.empty();
		}

		try {
			long spotId = Long.parseLong(matcher.group(1));
			String reason = separator < 0 ? "" : line.substring(separator + 1).strip();
			return Optional.of(new LlmCoursePlan.Entry(spotId, reason));
		} catch (NumberFormatException e) {
			return Optional.empty();
		}
	}

	private String describeCompanion(CourseCompanion companion) {
		return switch (companion) {
			case SOLO -> "혼자";
			case COUPLE -> "연인";
			case FRIENDS -> "친구";
			case FAMILY -> "가족(아이 동반)";
		};
	}

	private String describeThemes(List<CourseTheme> themes) {
		if (themes == null || themes.isEmpty()) {
			return "특별한 선호 없음";
		}
		return themes.stream().map(this::describeTheme).reduce((a, b) -> a + ", " + b).orElse("");
	}

	private String describeTheme(CourseTheme theme) {
		return switch (theme) {
			case HEALING -> "힐링·자연";
			case FOOD -> "맛집 탐방";
			case CAFE -> "카페 투어";
			case ACTIVITY -> "액티비티";
			case CULTURE -> "문화·역사";
		};
	}
}
