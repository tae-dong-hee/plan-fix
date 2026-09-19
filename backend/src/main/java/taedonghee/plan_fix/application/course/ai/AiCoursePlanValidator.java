package taedonghee.plan_fix.application.course.ai;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.course.CourseDayTheme;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * [application] LLM 배치 결과를 검증하고 고칠 수 있는 건 고친다.
 *
 * LLM 출력은 신뢰하지 않는다는 전제로 만든다. 고칠 수 있는 문제(없는 id, 중복,
 * 고정 장소 누락)는 여기서 바로잡고, 코스 자체가 성립하지 않는 수준이면
 * 거절해서 호출부가 규칙 기반으로 폴백하게 한다.
 */
@Slf4j
@Component
public class AiCoursePlanValidator {

	/** 하루 안에서 두 지점이 이보다 멀어지면 코스로 성립하지 않는다고 본다. */
	private static final double MAX_INTRA_DAY_DISTANCE_KM = 40.0;
	/** 하루에 이보다 많이 넣으면 현실적으로 소화할 수 없다. */
	private static final int MAX_SPOTS_PER_DAY = 6;

	/** A valid-looking plan must also use available local places matching that day's intent. */
	public Optional<ValidatedPlan> validate(LlmCoursePlan plan, List<SpotModel> candidates,
		List<SpotModel> anchors, int dayCount, List<CourseDayTheme> preferences) {
		return validate(plan, candidates, anchors, dayCount).filter(validated -> {
			for (int i = 0; i < validated.days().size(); i++) {
				List<SpotModel> day = validated.days().get(i);
				boolean hasFixedPlace = day.stream()
					.anyMatch(spot -> anchors.stream().anyMatch(anchor -> anchor.spotId().equals(spot.spotId())));
				List<DailyThemePreferences.Requirement> requirements = DailyThemePreferences.requirements(preferences.get(i));
				for (DailyThemePreferences.Requirement requirement : requirements) {
					if (day.stream().anyMatch(requirement::matches)) continue;
					// With no fixed place, a wrong neighborhood can be replanned entirely for the requested theme.
					boolean matchExists = candidates.stream().filter(requirement::matches)
						.anyMatch(candidate -> !hasFixedPlace || day.stream()
							.allMatch(spot -> CoursePlanner.distanceKm(candidate, spot) <= MAX_INTRA_DAY_DISTANCE_KM));
					boolean entirelyFixed = !day.isEmpty() && day.stream()
						.allMatch(spot -> anchors.stream().anyMatch(anchor -> anchor.spotId().equals(spot.spotId())));
					if (matchExists && !entirelyFixed) {
						log.info("[AI 코스] DAY {}의 {} 선호가 반영되지 않아 규칙 기반으로 폴백합니다.", i + 1, requirement.key());
						return false;
					}
				}
			}
			return true;
		});
	}

	/**
	 * @return 검증을 통과한(또는 고친) Day별 배치. 폴백해야 하면 비어 있다.
	 */
	public Optional<ValidatedPlan> validate(
		LlmCoursePlan plan,
		List<SpotModel> candidates,
		List<SpotModel> anchors,
		int dayCount
	) {
		Map<Long, SpotModel> byId = candidates.stream()
			.collect(Collectors.toMap(SpotModel::spotId, Function.identity(), (a, b) -> a));
		anchors.forEach(anchor -> byId.putIfAbsent(anchor.spotId(), anchor));

		List<List<SpotModel>> days = new ArrayList<>();
		Map<Long, String> reasons = new LinkedHashMap<>();
		Set<Long> used = new HashSet<>();
		int hallucinated = 0;

		for (int dayIndex = 0; dayIndex < dayCount; dayIndex++) {
			int dayNumber = dayIndex + 1;
			List<SpotModel> daySpots = new ArrayList<>();

			for (LlmCoursePlan.Entry entry : entriesOf(plan, dayNumber)) {
				SpotModel spot = byId.get(entry.spotId());
				if (spot == null) {
					// 후보에 없는 id를 지어낸 경우
					hallucinated++;
					continue;
				}
				if (!used.add(spot.spotId())) {
					// 같은 장소를 여러 날에 중복 배치한 경우 (course_spots 유니크 제약에도 걸린다)
					continue;
				}
				if (daySpots.size() >= MAX_SPOTS_PER_DAY) {
					used.remove(spot.spotId());
					continue;
				}
				daySpots.add(spot);
				if (entry.reason() != null && !entry.reason().isBlank()) {
					reasons.put(spot.spotId(), entry.reason());
				}
			}
			days.add(daySpots);
		}

		if (hallucinated > 0) {
			log.warn("[AI 코스] 후보에 없는 장소 {}건을 응답에서 제거했습니다.", hallucinated);
		}

		restoreMissingAnchors(days, anchors, used, reasons);

		if (!isUsable(days)) {
			log.warn("[AI 코스] 검증 결과 코스로 쓸 수 없어 규칙 기반으로 폴백합니다.");
			return Optional.empty();
		}

		return Optional.of(new ValidatedPlan(days, reasons));
	}

	private List<LlmCoursePlan.Entry> entriesOf(LlmCoursePlan plan, int dayNumber) {
		return plan.days().stream()
			.filter(day -> day.dayNumber() == dayNumber)
			.findFirst()
			.map(LlmCoursePlan.Day::entries)
			.orElse(List.of());
	}

	/** 고정 장소가 빠졌으면 되돌린다. 사용자가 명시적으로 요청한 것이라 LLM 판단보다 우선한다. */
	private void restoreMissingAnchors(
		List<List<SpotModel>> days, List<SpotModel> anchors, Set<Long> used, Map<Long, String> reasons) {

		if (days.isEmpty()) {
			return;
		}
		for (SpotModel anchor : anchors) {
			if (used.contains(anchor.spotId())) {
				continue;
			}
			// 가장 여유 있는 날에 넣는다.
			List<SpotModel> target = days.stream()
				.min((a, b) -> Integer.compare(a.size(), b.size()))
				.orElse(days.get(0));
			target.add(anchor);
			used.add(anchor.spotId());
			reasons.put(anchor.spotId(), "꼭 가고 싶다고 하신 곳이라 일정에 넣었어요.");
			log.info("[AI 코스] 응답에서 누락된 고정 장소 {}를 복구했습니다.", anchor.spotId());
		}
	}

	/** 코스로 성립하는지. 하나라도 어긋나면 규칙 기반으로 폴백한다. */
	private boolean isUsable(List<List<SpotModel>> days) {
		boolean hasAnySpot = days.stream().anyMatch(day -> !day.isEmpty());
		if (!hasAnySpot) {
			return false;
		}
		// 절반 넘는 날이 비어 있으면 배치를 제대로 못 한 것으로 본다.
		long emptyDays = days.stream().filter(List::isEmpty).count();
		if (emptyDays * 2 > days.size()) {
			return false;
		}
		return days.stream().allMatch(this::isWithinReasonableDistance);
	}

	private boolean isWithinReasonableDistance(List<SpotModel> day) {
		for (int i = 0; i < day.size(); i++) {
			for (int j = i + 1; j < day.size(); j++) {
				if (CoursePlanner.distanceKm(day.get(i), day.get(j)) > MAX_INTRA_DAY_DISTANCE_KM) {
					return false;
				}
			}
		}
		return true;
	}

	/** 검증을 통과한 배치와, 장소별 추천 이유. */
	public record ValidatedPlan(List<List<SpotModel>> days, Map<Long, String> reasons) {
	}
}
