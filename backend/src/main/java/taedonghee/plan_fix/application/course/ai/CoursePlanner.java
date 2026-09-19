package taedonghee.plan_fix.application.course.ai;

import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.course.CourseDayTheme;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * [application] 후보 스팟을 Day별 코스로 배치하는 규칙 기반 엔진.
 *
 * 외부 의존이 없는 순수 계산이라 DB나 LLM 없이 단독으로 검증할 수 있다.
 * LLM 배치가 실패하거나 결과가 유효하지 않을 때의 폴백이자, LLM에 넘길
 * 후보를 추리는 데도 같은 점수 계산을 쓴다.
 *
 * 배치 순서:
 *   1) 점수 매기기 (정보 충실도 × 테마 선호도)
 *   2) 좌표로 Day 수만큼 군집화 — 하루 동선이 흩어지지 않게
 *   3) 군집을 Day에 배정 (고정 장소가 있는 군집을 첫날로)
 *   4) 군집 안에서 점수순으로 뽑되, 하루에 식사 한 곳은 넣고
 *   5) 가까운 곳끼리 이어지도록 순서 정렬
 */
public class CoursePlanner {

	private static final int MAX_MEALS_PER_DAY = 2;
	private static final String CATEGORY_RESTAURANT = "음식점";
	/** 지구 반지름(km). 두 좌표 사이 거리를 구할 때 쓴다. */
	private static final double EARTH_RADIUS_KM = 6371.0;
	private static final double MAX_DAILY_DISTANCE_KM = 40.0;

	/** Daily selections determine both the region seed and spot ranking for that date. */
	public List<List<SpotModel>> plan(
		List<SpotModel> candidates, List<SpotModel> anchors, int dayCount,
		List<CourseTheme> themes, CourseCompanion companion, Map<String, Long> likedCategoryCounts,
		List<CourseDayTheme> dayThemes
	) {
		if (dayThemes.isEmpty()) return plan(candidates, anchors, dayCount, themes, companion, likedCategoryCounts);
		List<CourseDayTheme> preferences = DailyThemePreferences.resolve(themes, dayThemes, dayCount);
		var poolById = new LinkedHashMap<Long, SpotModel>();
		candidates.stream().filter(CoursePlanner::hasCoordinates).forEach(spot -> poolById.put(spot.spotId(), spot));
		List<SpotModel> validAnchors = anchors.stream().filter(CoursePlanner::hasCoordinates).toList();
		validAnchors.forEach(spot -> poolById.put(spot.spotId(), spot));
		Set<Long> anchorIds = validAnchors.stream().map(SpotModel::spotId).collect(HashSet::new, Set::add, Set::addAll);
		List<List<SpotModel>> anchorGroups = clusterByLocation(validAnchors, dayCount);
		Set<Long> used = new HashSet<>();
		List<List<SpotModel>> result = new ArrayList<>();
		for (int dayIndex = 0; dayIndex < dayCount; dayIndex++) {
			CourseDayTheme preference = preferences.get(dayIndex);
			List<SpotModel> fixed = dayIndex < anchorGroups.size() ? anchorGroups.get(dayIndex) : List.of();
			Set<Long> todayAnchors = fixed.stream().map(SpotModel::spotId).collect(HashSet::new, Set::add, Set::addAll);
			List<SpotModel> remaining = poolById.values().stream()
				.filter(spot -> !used.contains(spot.spotId()))
				.filter(spot -> !anchorIds.contains(spot.spotId()) || todayAnchors.contains(spot.spotId())).toList();
			Set<Long> reserved = reserveForFutureDays(remaining.stream().filter(spot -> !anchorIds.contains(spot.spotId())).toList(),
				preferences.subList(dayIndex + 1, preferences.size()), likedCategoryCounts);
			List<DailyThemePreferences.Requirement> required = DailyThemePreferences.requirements(preference);
			List<SpotModel> available = remaining.stream().filter(spot -> !reserved.contains(spot.spotId())
				|| todayAnchors.contains(spot.spotId()) || required.stream().anyMatch(requirement -> requirement.matches(spot)
					&& remaining.stream().noneMatch(other -> !reserved.contains(other.spotId()) && requirement.matches(other)))).toList();
			Map<Long, Double> scores = scoreAll(available, preference, likedCategoryCounts);
			List<SpotModel> ranked = available.stream().sorted(Comparator
				.comparingDouble((SpotModel spot) -> scores.getOrDefault(spot.spotId(), 0.0)).reversed()).toList();
			// Pick the neighborhood from the requested intent before comparing metadata quality.
			// A complete generic listing (or a meal) must not displace a sparse activity/nature match.
			SpotModel seed = fixed.isEmpty() ? ranked.stream()
				.filter(spot -> required.stream().anyMatch(requirement -> requirement.matches(spot)))
				.max(Comparator.comparingLong((SpotModel spot) -> required.stream()
					.filter(requirement -> !CATEGORY_RESTAURANT.equals(requirement.key()) && requirement.matches(spot)).count())
					.thenComparingLong(spot -> required.stream().filter(requirement -> requirement.matches(spot)).count())
					.thenComparingDouble(spot -> scores.getOrDefault(spot.spotId(), 0.0)))
				.orElseGet(() -> ranked.stream().findFirst().orElse(null)) : fixed.get(0);
			List<SpotModel> local = seed == null ? List.of() : ranked.stream()
				.filter(spot -> distanceKm(seed, spot) <= MAX_DAILY_DISTANCE_KM)
				.filter(spot -> fitsNearby(spot, fixed)).toList();
			List<SpotModel> picked = new ArrayList<>(fixed);
			int remainingCount = poolById.size() - used.size();
			int fairShare = (int) Math.ceil((double) remainingCount / (dayCount - dayIndex));
			int limit = Math.max(Math.min(companion.spotsPerDay(), fairShare), fixed.size());
			if (limit > 1 && picked.stream().noneMatch(CoursePlanner::isRestaurant) && picked.size() < limit) {
				local.stream().filter(CoursePlanner::isRestaurant).findFirst().ifPresent(picked::add);
			}
			while (picked.size() < limit) {
				List<DailyThemePreferences.Requirement> missing = required.stream()
					.filter(requirement -> picked.stream().noneMatch(requirement::matches)).toList();
				SpotModel next = local.stream().filter(spot -> canPick(spot, picked))
					.filter(spot -> missing.stream().anyMatch(requirement -> requirement.matches(spot)))
					.max(Comparator.comparingLong((SpotModel spot) -> missing.stream().filter(r -> r.matches(spot)).count())
						.thenComparingDouble(spot -> scores.getOrDefault(spot.spotId(), 0.0))).orElse(null);
				if (next == null) break;
				picked.add(next);
			}
			for (SpotModel spot : local) {
				if (picked.size() >= limit) break;
				if (canPick(spot, picked)) picked.add(spot);
			}
			picked.forEach(spot -> used.add(spot.spotId()));
			result.add(orderByProximity(picked));
		}
		return result;
	}

	/** Preserve a nearby representative of each later day's intent before filling an earlier day. */
	private Set<Long> reserveForFutureDays(List<SpotModel> candidates, List<CourseDayTheme> futureDays,
		Map<String, Long> likedCategoryCounts) {
		Set<Long> reserved = new HashSet<>();
		for (CourseDayTheme future : futureDays) {
			Map<Long, Double> scores = scoreAll(candidates, future, likedCategoryCounts);
			List<SpotModel> dayRepresentatives = new ArrayList<>();
			for (DailyThemePreferences.Requirement requirement : DailyThemePreferences.requirements(future)) {
				if (dayRepresentatives.stream().anyMatch(requirement::matches)) continue;
				candidates.stream().filter(requirement::matches).filter(spot -> !reserved.contains(spot.spotId()))
					.filter(spot -> fitsNearby(spot, dayRepresentatives))
					.max(Comparator.comparingDouble(spot -> scores.getOrDefault(spot.spotId(), 0.0)))
					.ifPresent(spot -> { reserved.add(spot.spotId()); dayRepresentatives.add(spot); });
			}
		}
		return reserved;
	}

	private static boolean fitsNearby(SpotModel spot, List<SpotModel> picked) {
		return picked.stream().allMatch(other -> distanceKm(spot, other) <= MAX_DAILY_DISTANCE_KM);
	}

	private static boolean canPick(SpotModel spot, List<SpotModel> picked) {
		return picked.stream().noneMatch(other -> other.spotId().equals(spot.spotId()))
			&& fitsNearby(spot, picked)
			&& (!isRestaurant(spot) || picked.stream().filter(CoursePlanner::isRestaurant).count() < MAX_MEALS_PER_DAY);
	}

	Map<Long, Double> scoreAll(List<SpotModel> spots, CourseDayTheme day, Map<String, Long> likedCategoryCounts) {
		var scores = new LinkedHashMap<Long, Double>();
		for (SpotModel spot : spots) scores.put(spot.spotId(), qualityScore(spot)
			* (preferenceScore(spot, DailyThemePreferences.themes(day), likedCategoryCounts)
				+ DailyThemePreferences.semanticBonus(spot, day)));
		return scores;
	}

	/**
	 * @param candidates 지역으로 이미 걸러진 후보들
	 * @param anchors    사용자가 "꼭 가고 싶다"고 지정한 곳. 반드시 결과에 포함된다.
	 */
	public List<List<SpotModel>> plan(
		List<SpotModel> candidates,
		List<SpotModel> anchors,
		int dayCount,
		List<CourseTheme> themes,
		CourseCompanion companion,
		Map<String, Long> likedCategoryCounts
	) {
		if (dayCount < 1) {
			throw new IllegalArgumentException("dayCount는 1 이상이어야 합니다.");
		}

		List<SpotModel> plottable = candidates.stream().filter(CoursePlanner::hasCoordinates).toList();
		List<SpotModel> anchorList = anchors.stream().filter(CoursePlanner::hasCoordinates).toList();

		// 고정 장소는 후보에 없을 수도 있으니(다른 지역을 골랐다든지) 합쳐서 다룬다.
		Set<Long> anchorIds = anchorList.stream().map(SpotModel::spotId).collect(HashSet::new, Set::add, Set::addAll);
		List<SpotModel> pool = new ArrayList<>(anchorList);
		plottable.stream().filter(spot -> !anchorIds.contains(spot.spotId())).forEach(pool::add);

		if (pool.isEmpty()) {
			return emptyDays(dayCount);
		}

		Map<Long, Double> scores = scoreAll(pool, themes, likedCategoryCounts);
		List<List<SpotModel>> clusters = clusterByLocation(pool, dayCount);
		List<List<SpotModel>> orderedClusters = orderClustersByAnchor(clusters, anchorIds);

		List<List<SpotModel>> days = new ArrayList<>();
		for (int dayIndex = 0; dayIndex < dayCount; dayIndex++) {
			List<SpotModel> cluster = dayIndex < orderedClusters.size() ? orderedClusters.get(dayIndex) : List.of();
			List<SpotModel> picked = pickForDay(cluster, scores, anchorIds, companion.spotsPerDay());
			days.add(orderByProximity(picked));
		}
		return days;
	}

	/**
	 * 후보 점수 = 정보 충실도 × 테마 선호도.
	 *
	 * 좋아요·조회수는 거의 0이라 쓰지 않는다. 대신 관광공사에 정보가 얼마나
	 * 충실히 등록됐는지를 "관리되는 장소"의 대리 지표로 삼는다.
	 */
	Map<Long, Double> scoreAll(List<SpotModel> spots, List<CourseTheme> themes, Map<String, Long> likedCategoryCounts) {
		Map<Long, Double> scores = new LinkedHashMap<>();
		for (SpotModel spot : spots) {
			double score = qualityScore(spot) * preferenceScore(spot, themes, likedCategoryCounts);
			scores.put(spot.spotId(), score);
		}
		return scores;
	}

	/** 정보가 충실할수록 실제로 갈 만한 곳일 가능성이 높다고 본다. 0.1 ~ 1.0 */
	double qualityScore(SpotModel spot) {
		double score = 0.1;
		if (spot.thumbnail() != null && !spot.thumbnail().isBlank()) {
			score += 0.4;
		}
		String description = spot.description();
		if (description != null && description.strip().length() >= 50) {
			score += 0.3;
		} else if (description != null && !description.isBlank()) {
			score += 0.15;
		}
		if (spot.address() != null && !spot.address().isBlank()) {
			score += 0.2;
		}
		return Math.min(1.0, score);
	}

	/**
	 * 테마 선호도. 여러 테마를 고르면 그 중 가장 잘 맞는 값을 쓴다(평균을 내면
	 * 어중간한 장소가 이겨버린다). 좋아요 이력이 쌓여 있으면 살짝 보정한다.
	 */
	double preferenceScore(SpotModel spot, List<CourseTheme> themes, Map<String, Long> likedCategoryCounts) {
		String category = spot.category();
		double themeWeight = themes == null || themes.isEmpty()
			? 0.6
			: themes.stream().mapToDouble(theme -> theme.weightOf(category)).max().orElse(0.15);

		return themeWeight * (1.0 + likedCategoryBonus(category, likedCategoryCounts));
	}

	/**
	 * 좋아요한 카테고리에 최대 30% 가산. 표본이 적을 땐 거의 영향이 없도록
	 * 전체 좋아요 수 대비 비율로 계산한다(좋아요 2건으로 취향이 정해지면 곤란하다).
	 */
	private double likedCategoryBonus(String category, Map<String, Long> likedCategoryCounts) {
		if (likedCategoryCounts == null || likedCategoryCounts.isEmpty()) {
			return 0.0;
		}
		long total = likedCategoryCounts.values().stream().mapToLong(Long::longValue).sum();
		if (total < 3) {
			return 0.0;
		}
		long liked = likedCategoryCounts.getOrDefault(category, 0L);
		return 0.3 * ((double) liked / total);
	}

	/**
	 * 좌표 기준 k-평균 군집화. 시작 중심점을 무작위로 잡으면 실행할 때마다 결과가
	 * 달라져서, 가장 멀리 떨어진 점들을 순서대로 골라 결정적으로 만든다.
	 */
	List<List<SpotModel>> clusterByLocation(List<SpotModel> spots, int k) {
		if (k <= 1 || spots.size() <= k) {
			return spots.isEmpty() ? List.of() : List.of(new ArrayList<>(spots));
		}

		List<double[]> centroids = initialCentroids(spots, k);
		List<List<SpotModel>> clusters = new ArrayList<>();

		for (int iteration = 0; iteration < 20; iteration++) {
			clusters = new ArrayList<>();
			for (int i = 0; i < k; i++) {
				clusters.add(new ArrayList<>());
			}

			for (SpotModel spot : spots) {
				int nearest = 0;
				double best = Double.MAX_VALUE;
				for (int i = 0; i < centroids.size(); i++) {
					double distance = squaredDistance(latitude(spot), longitude(spot), centroids.get(i)[0], centroids.get(i)[1]);
					if (distance < best) {
						best = distance;
						nearest = i;
					}
				}
				clusters.get(nearest).add(spot);
			}

			List<double[]> next = new ArrayList<>();
			boolean moved = false;
			for (int i = 0; i < k; i++) {
				List<SpotModel> cluster = clusters.get(i);
				if (cluster.isEmpty()) {
					next.add(centroids.get(i));
					continue;
				}
				double lat = cluster.stream().mapToDouble(CoursePlanner::latitude).average().orElse(centroids.get(i)[0]);
				double lng = cluster.stream().mapToDouble(CoursePlanner::longitude).average().orElse(centroids.get(i)[1]);
				if (Math.abs(lat - centroids.get(i)[0]) > 1e-6 || Math.abs(lng - centroids.get(i)[1]) > 1e-6) {
					moved = true;
				}
				next.add(new double[] { lat, lng });
			}
			centroids = next;
			if (!moved) {
				break;
			}
		}

		return clusters.stream().filter(cluster -> !cluster.isEmpty()).toList();
	}

	/** 첫 중심점은 가장 북쪽 지점, 이후는 이미 뽑힌 중심점들에서 가장 먼 지점을 고른다. */
	private List<double[]> initialCentroids(List<SpotModel> spots, int k) {
		List<double[]> centroids = new ArrayList<>();
		SpotModel first = spots.stream().max(Comparator.comparingDouble(CoursePlanner::latitude)).orElseThrow();
		centroids.add(new double[] { latitude(first), longitude(first) });

		while (centroids.size() < k) {
			SpotModel farthest = null;
			double farthestDistance = -1;
			for (SpotModel spot : spots) {
				double nearest = centroids.stream()
					.mapToDouble(c -> squaredDistance(latitude(spot), longitude(spot), c[0], c[1]))
					.min()
					.orElse(0);
				if (nearest > farthestDistance) {
					farthestDistance = nearest;
					farthest = spot;
				}
			}
			if (farthest == null) {
				break;
			}
			centroids.add(new double[] { latitude(farthest), longitude(farthest) });
		}
		return centroids;
	}

	/** 고정 장소가 든 군집을 앞으로 당긴다. 나머지는 규모가 큰 군집부터. */
	private List<List<SpotModel>> orderClustersByAnchor(List<List<SpotModel>> clusters, Set<Long> anchorIds) {
		return clusters.stream()
			.sorted(Comparator
				.comparing((List<SpotModel> cluster) -> cluster.stream().noneMatch(s -> anchorIds.contains(s.spotId())))
				.thenComparing(cluster -> -cluster.size()))
			.toList();
	}

	/**
	 * 하루치를 고른다. 고정 장소는 무조건 넣고, 나머지는 점수순으로 채우되
	 * 식사할 곳이 하나도 없는 날이 생기지 않게 음식점 한 곳은 확보한다.
	 */
	private List<SpotModel> pickForDay(List<SpotModel> cluster, Map<Long, Double> scores, Set<Long> anchorIds, int limit) {
		if (cluster.isEmpty()) {
			return List.of();
		}

		List<SpotModel> picked = new ArrayList<>();
		Set<Long> pickedIds = new HashSet<>();

		for (SpotModel spot : cluster) {
			if (anchorIds.contains(spot.spotId()) && pickedIds.add(spot.spotId())) {
				picked.add(spot);
			}
		}

		List<SpotModel> rest = cluster.stream()
			.filter(spot -> !pickedIds.contains(spot.spotId()))
			.sorted(Comparator.comparingDouble((SpotModel s) -> scores.getOrDefault(s.spotId(), 0.0)).reversed())
			.toList();

		boolean hasMeal = picked.stream().anyMatch(CoursePlanner::isRestaurant);
		if (!hasMeal) {
			rest.stream()
				.filter(CoursePlanner::isRestaurant)
				.findFirst()
				.ifPresent(meal -> {
					picked.add(meal);
					pickedIds.add(meal.spotId());
				});
		}

		long meals = picked.stream().filter(CoursePlanner::isRestaurant).count();
		for (SpotModel spot : rest) {
			if (picked.size() >= limit) {
				break;
			}
			if (pickedIds.contains(spot.spotId())) {
				continue;
			}
			// 하루가 식당으로만 채워지지 않게 상한을 둔다.
			if (isRestaurant(spot)) {
				if (meals >= MAX_MEALS_PER_DAY) {
					continue;
				}
				meals++;
			}
			picked.add(spot);
			pickedIds.add(spot.spotId());
		}

		return picked;
	}

	/** 가까운 곳끼리 이어지도록 최근접 이웃으로 순서를 정한다. */
	List<SpotModel> orderByProximity(List<SpotModel> spots) {
		if (spots.size() <= 2) {
			return new ArrayList<>(spots);
		}

		List<SpotModel> remaining = new ArrayList<>(spots);
		List<SpotModel> ordered = new ArrayList<>();
		// 가장 서쪽(내륙)에서 시작해 동쪽(바다)으로 이동하는 편이 자연스럽다.
		SpotModel current = remaining.stream().min(Comparator.comparingDouble(CoursePlanner::longitude)).orElseThrow();
		remaining.remove(current);
		ordered.add(current);

		while (!remaining.isEmpty()) {
			SpotModel from = current;
			SpotModel nearest = remaining.stream()
				.min(Comparator.comparingDouble(s -> squaredDistance(latitude(from), longitude(from), latitude(s), longitude(s))))
				.orElseThrow();
			remaining.remove(nearest);
			ordered.add(nearest);
			current = nearest;
		}
		return ordered;
	}

	/** 두 지점 사이 거리(km). 하루 동선이 과하게 벌어졌는지 검증할 때 쓴다. */
	public static double distanceKm(SpotModel a, SpotModel b) {
		double lat1 = Math.toRadians(latitude(a));
		double lat2 = Math.toRadians(latitude(b));
		double deltaLat = lat2 - lat1;
		double deltaLng = Math.toRadians(longitude(b) - longitude(a));

		double h = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
			+ Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
		return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1.0, Math.sqrt(h)));
	}

	private static boolean isRestaurant(SpotModel spot) {
		return CATEGORY_RESTAURANT.equals(spot.category());
	}

	private static boolean hasCoordinates(SpotModel spot) {
		return spot != null && spot.latitude() != null && spot.longitude() != null;
	}

	private static double latitude(SpotModel spot) {
		return toDouble(spot.latitude());
	}

	private static double longitude(SpotModel spot) {
		return toDouble(spot.longitude());
	}

	private static double toDouble(BigDecimal value) {
		return value == null ? 0.0 : value.doubleValue();
	}

	/** 위경도 차이를 그대로 제곱합한 값. 순위 비교용이라 실제 거리로 환산하지 않는다. */
	private static double squaredDistance(double lat1, double lng1, double lat2, double lng2) {
		double dLat = lat1 - lat2;
		double dLng = lng1 - lng2;
		return dLat * dLat + dLng * dLng;
	}

	private static List<List<SpotModel>> emptyDays(int dayCount) {
		List<List<SpotModel>> days = new ArrayList<>();
		for (int i = 0; i < dayCount; i++) {
			days.add(List.of());
		}
		return days;
	}
}
