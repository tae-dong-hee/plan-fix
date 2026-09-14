package taedonghee.plan_fix.application.course.ai;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.application.spot.SpotThumbnailResolver;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSearchCondition;
import taedonghee.plan_fix.domain.spot.SpotSortType;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * [application] AI 코스 초안 생성.
 *
 * 결과를 저장하지 않고 초안만 돌려준다. 사용자가 코스 생성 화면에서 확인·수정한 뒤
 * 기존 저장 흐름을 그대로 타게 하기 위함이다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AiCourseDraftApplicationService {

	/** 코스 하나가 커버할 수 있는 최대 일수. CourseModel의 제약과 맞춘다. */
	private static final int MAX_DAYS = 30;
	/**
	 * 후보를 가져올 상한. 시군 하나가 대략 1,000~1,500개라 전량을 훑어도 부담이 없고,
	 * 일부만 잘라오면 점수 계산이 "수집 순서 상위 N개" 안에서만 이뤄져 의미가 없어진다.
	 */
	private static final int CANDIDATE_FETCH_LIMIT = 2000;
	/**
	 * LLM 프롬프트에 넣을 후보 수. 하루 4~5곳 × 최대 며칠을 고르기에 충분하면서,
	 * 목록이 길어질수록 없는 장소를 지어내는 빈도가 올라가는 것을 감안한 값이다.
	 */
	private static final int LLM_SHORTLIST_SIZE = 60;
	/** 숙박은 예약 정보가 없어 추천 책임이 애매하다. 고정 장소로 직접 지정하는 건 허용한다. */
	private static final List<String> EXCLUDED_CATEGORIES = List.of("숙박");

	private final SpotRepository spotRepository;
	private final AiCourseLlmPlanner llmPlanner;
	private final AiCoursePlanValidator planValidator;
	private final SpotThumbnailResolver spotThumbnailResolver;
	private final RoadCourseOptimizer roadCourseOptimizer;
	private final CoursePlanner coursePlanner = new CoursePlanner();

	public AiCourseDraftResult createDraft(Long userId, AiCourseCommand command) {
		int dayCount = resolveDayCount(command);

		List<SpotModel> candidates = fetchCandidates(command);
		List<SpotModel> anchors = command.anchorSpotIds().isEmpty()
			? List.of()
			: spotRepository.findAllByIdIn(command.anchorSpotIds());

		if (candidates.isEmpty() && anchors.isEmpty()) {
			throw new CoreException(ErrorType.NOT_FOUND,
				"선택하신 지역에 추천할 장소가 없습니다. 다른 지역을 골라주세요.");
		}

		Map<String, Long> likedCategoryCounts = likedCategoryCounts(userId);

		// LLM에는 규칙 기반 점수로 추린 상위 후보만 넘긴다. 전체를 주면 비용도 크고
		// 목록이 길수록 없는 장소를 지어내는 빈도가 올라간다.
		List<SpotModel> shortlist = shortlistForLlm(candidates, command, likedCategoryCounts);

		return llmPlanner.plan(shortlist, anchors, dayCount, command.themes(), command.companion())
			.flatMap(plan -> planValidator.validate(plan, shortlist, anchors, dayCount))
			.map(validated -> toResult(command, validated.days(), anchors, dayCount, validated.reasons(), "LLM"))
			.orElseGet(() -> {
				List<List<SpotModel>> plannedDays = coursePlanner.plan(
					candidates, anchors, dayCount, command.themes(), command.companion(), likedCategoryCounts);
				return toResult(command, plannedDays, anchors, dayCount, Map.of(), "RULE_BASED");
			});
	}

	/** 규칙 기반 점수 상위 후보만 남긴다. 순서도 점수순이라 LLM이 위쪽을 우선 보게 된다. */
	private List<SpotModel> shortlistForLlm(
		List<SpotModel> candidates, AiCourseCommand command, Map<String, Long> likedCategoryCounts) {

		Map<Long, Double> scores =
			coursePlanner.scoreAll(candidates, command.themes(), likedCategoryCounts);

		List<SpotModel> ranked = candidates.stream()
			.filter(spot -> spot.latitude() != null && spot.longitude() != null)
			.sorted(java.util.Comparator
				.comparingDouble((SpotModel spot) -> scores.getOrDefault(spot.spotId(), 0.0)).reversed())
			.toList();
		// 한 카테고리가 후보를 독점하지 않도록 카테고리별 상한을 둔다.
		// FOOD 테마에서도 맛집 주변의 관광지·카페가 LLM 후보에 반드시 들어가야 한다.
		int perCategory = Math.max(4, LLM_SHORTLIST_SIZE / 5);
		List<SpotModel> diversified = ranked.stream()
			.collect(Collectors.groupingBy(spot -> spot.category() == null ? "기타" : spot.category(),
				java.util.LinkedHashMap::new, Collectors.toList()))
			.values().stream().flatMap(list -> list.stream().limit(perCategory)).toList();
		return java.util.stream.Stream.concat(diversified.stream(), ranked.stream())
			.distinct().limit(LLM_SHORTLIST_SIZE).toList();
	}

	/**
	 * 지역으로 후보를 모은다. 카테고리는 여기서 거르지 않고 전량 가져온 뒤 제외 목록만
	 * 걸러낸다 — 카테고리별로 나눠 조회하면 테마 가중치를 매기기 전에 비율이 고정돼버린다.
	 */
	private List<SpotModel> fetchCandidates(AiCourseCommand command) {
		SpotSearchCondition condition =
			new SpotSearchCondition(null, null, command.region(), command.sigungu());

		return spotRepository.searchActive(condition, SpotSortType.LATEST, 0, CANDIDATE_FETCH_LIMIT).stream()
			.filter(spot -> !EXCLUDED_CATEGORIES.contains(spot.category()))
			.toList();
	}

	/** 좋아요 이력의 카테고리 분포. 로그인하지 않았거나 이력이 없으면 비어 있다. */
	private Map<String, Long> likedCategoryCounts(Long userId) {
		if (userId == null) {
			return Map.of();
		}
		return spotRepository.findLikedByUserId(userId).stream()
			.filter(spot -> spot.category() != null)
			.collect(Collectors.groupingBy(SpotModel::category, Collectors.counting()));
	}

	private int resolveDayCount(AiCourseCommand command) {
		if (command.startDate() == null || command.endDate() == null) {
			throw new CoreException(ErrorType.BAD_REQUEST, "여행 시작일과 종료일이 필요합니다.");
		}
		if (command.endDate().isBefore(command.startDate())) {
			throw new CoreException(ErrorType.BAD_REQUEST, "종료일은 시작일보다 빠를 수 없습니다.");
		}
		long days = ChronoUnit.DAYS.between(command.startDate(), command.endDate()) + 1;
		if (days > MAX_DAYS) {
			throw new CoreException(ErrorType.BAD_REQUEST, "여행 기간은 최대 " + MAX_DAYS + "일까지 가능합니다.");
		}
		return (int) days;
	}

	private AiCourseDraftResult toResult(
		AiCourseCommand command, List<List<SpotModel>> plannedDays, List<SpotModel> anchors,
		int dayCount, Map<Long, String> llmReasons, String generatedBy) {

		Map<Long, SpotModel> anchorsById = anchors.stream()
			.collect(Collectors.toMap(SpotModel::spotId, Function.identity(), (a, b) -> a));
		Map<Long, String> thumbnails = spotThumbnailResolver.resolve(
			plannedDays.stream().flatMap(List::stream).distinct().toList());

		List<RoadCourseOptimizer.Result> orderedDays = roadCourseOptimizer.optimizeDays(plannedDays);
		List<AiCourseDraftResult.Day> days = new java.util.ArrayList<>();
		for (int i = 0; i < orderedDays.size(); i++) {
			RoadCourseOptimizer.Result orderedDay = orderedDays.get(i);
			List<AiCourseDraftResult.Spot> spots = orderedDay.spots().stream()
				.map(spot -> {
					// LLM이 써준 이유가 있으면 그걸 쓰고, 없으면 규칙 기반 문구로 채운다.
					String reason = llmReasons.getOrDefault(spot.spotId(), reasonFor(spot, anchorsById));
					return AiCourseDraftResult.Spot.from(spot, reason, thumbnails.get(spot.spotId()));
				})
				.toList();
			days.add(new AiCourseDraftResult.Day(i + 1, spots, orderedDay.routeStatus(), orderedDay.drivingDistanceMeters()));
		}

		return new AiCourseDraftResult(
			suggestTitle(command, dayCount),
			command.startDate(),
			command.endDate(),
			days,
			generatedBy
		);
	}

	/** 규칙 기반 단계의 근거 문구. LLM이 이유를 써주면 그쪽이 우선한다. */
	private String reasonFor(SpotModel spot, Map<Long, SpotModel> anchorsById) {
		if (anchorsById.containsKey(spot.spotId())) {
			return "꼭 가고 싶다고 하신 곳이라 일정에 넣었어요.";
		}
		return switch (spot.category() == null ? "" : spot.category()) {
			case "음식점" -> "이 근처에서 식사하기 좋은 곳이에요.";
			case "카페/음료" -> "동선 중간에 쉬어가기 좋아요.";
			case "관광지" -> "이 지역에서 둘러볼 만한 곳이에요.";
			case "문화시설" -> "실내라 날씨와 상관없이 갈 수 있어요.";
			case "레포츠" -> "몸으로 즐길 수 있는 곳이에요.";
			default -> "동선에 맞춰 함께 묶었어요.";
		};
	}

	private String suggestTitle(AiCourseCommand command, int dayCount) {
		int nights = Math.max(0, dayCount - 1);
		String period = nights == 0 ? "당일치기" : nights + "박 " + dayCount + "일";
		return period + " 여행 코스";
	}
}
