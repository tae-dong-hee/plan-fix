package taedonghee.plan_fix.application.course.ai;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigInteger;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

class RoadVisitOrderTest {

	private static final long UNREACHABLE = Long.MAX_VALUE;

	@Test
	@DisplayName("강 건너 가까운 장소를 바로 잇는 대신 실제 도로 거리의 합이 짧은 순서를 고른다")
	void road_detour_changes_the_visit_order() {
		// 0 and 1 are nearby across a river, but reaching the bridge makes that drive 9 km.
		long[][] roads = {
			{0, 9_000, 1_000, 5_000},
			{9_000, 0, 6_000, 1_000},
			{1_000, 6_000, 0, 1_200},
			{5_000, 1_000, 1_200, 0}
		};

		List<Integer> order = RoadVisitOrder.shortestOpenPath(roads).orElseThrow();

		assertThat(order).containsExactly(0, 2, 3, 1);
		assertThat(total(roads, order)).isEqualTo(BigInteger.valueOf(3_200));
		assertThat(total(roads, List.of(0, 1, 2, 3))).isEqualTo(BigInteger.valueOf(16_200));
	}

	@Test
	@DisplayName("일방통행처럼 방향마다 다른 거리를 반영하고 출발 장소도 자유롭게 고른다")
	void asymmetric_roads_can_require_a_different_start() {
		long[][] roads = {
			{0, 5, 99},
			{99, 0, 99},
			{4, 99, 0}
		};

		assertThat(RoadVisitOrder.shortestOpenPath(roads)).contains(List.of(2, 0, 1));
	}

	@Test
	@DisplayName("마지막 장소에서 출발지로 돌아오는 거리는 방문 순서에 포함하지 않는다")
	void minimizes_an_open_path_instead_of_a_round_trip() {
		long[][] roads = {
			{0, 1, 4},
			{4, 0, 1},
			{100, 4, 0}
		};

		assertThat(RoadVisitOrder.shortestOpenPath(roads)).contains(List.of(0, 1, 2));
		assertThat(total(roads, List.of(0, 1, 2, 0))).isEqualTo(BigInteger.valueOf(102));
		assertThat(total(roads, List.of(0, 2, 1, 0))).isEqualTo(BigInteger.valueOf(12));
	}

	@Test
	@DisplayName("일부 구간을 갈 수 없어도 전체 장소를 잇는 다른 순서가 있으면 사용한다")
	void unreachable_edges_do_not_discard_a_viable_path() {
		long[][] roads = {
			{0, UNREACHABLE, 4},
			{UNREACHABLE, 0, UNREACHABLE},
			{UNREACHABLE, 5, 0}
		};

		assertThat(RoadVisitOrder.shortestOpenPath(roads)).contains(List.of(0, 2, 1));
	}

	@Test
	@DisplayName("모든 장소를 잇는 순서가 없으면 결과를 만들지 않는다")
	void no_complete_path_is_empty() {
		long[][] roads = {
			{0, 5, UNREACHABLE},
			{5, 0, UNREACHABLE},
			{UNREACHABLE, UNREACHABLE, 0}
		};

		assertThat(RoadVisitOrder.shortestOpenPath(roads)).isEmpty();
	}

	@Test
	@DisplayName("거리가 같으면 입력된 장소 순서를 유지한다")
	void equal_distances_preserve_original_order() {
		long[][] roads = {
			{0, 10, 10, 10},
			{10, 0, 10, 10},
			{10, 10, 0, 10},
			{10, 10, 10, 0}
		};

		assertThat(RoadVisitOrder.shortestOpenPath(roads)).contains(List.of(0, 1, 2, 3));
	}

	@Test
	@DisplayName("0미터 구간도 갈 수 있는 도로로 취급한다")
	void zero_distance_edges_are_reachable() {
		assertThat(RoadVisitOrder.shortestOpenPath(new long[3][3])).contains(List.of(0, 1, 2));
	}

	@Test
	@DisplayName("빈 장소 목록과 장소 한 곳은 그대로 반환한다")
	void empty_and_single_stop_paths_are_valid() {
		assertThat(RoadVisitOrder.shortestOpenPath(new long[0][0])).contains(List.of());
		assertThat(RoadVisitOrder.shortestOpenPath(new long[][] {{0}})).contains(List.of(0));
	}

	@Test
	@DisplayName("10개 장소까지 처리하고 한도를 넘으면 결과를 만들지 않는다")
	void supports_ten_stops_but_bounds_larger_searches() {
		assertThat(RoadVisitOrder.shortestOpenPath(new long[10][10]))
			.contains(List.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9));
		assertThat(RoadVisitOrder.shortestOpenPath(new long[11][11])).isEmpty();
	}

	@Test
	@DisplayName("아주 긴 구간의 합이 오버플로되어 더 짧은 경로로 선택되지 않는다")
	void overflowing_alternatives_do_not_beat_a_shorter_path() {
		long huge = Long.MAX_VALUE - 1;
		long[][] roads = {
			{0, huge, 4},
			{huge, 0, huge},
			{huge, 5, 0}
		};

		assertThat(RoadVisitOrder.shortestOpenPath(roads)).contains(List.of(0, 2, 1));
	}

	@Test
	@DisplayName("모든 경로의 합이 long 범위를 넘어도 정확한 최단 순서를 구한다")
	void compares_totals_exactly_beyond_long_range() {
		long huge = Long.MAX_VALUE - 1;
		long[][] roads = {
			{0, huge, huge - 10},
			{huge, 0, huge},
			{huge, huge - 20, 0}
		};

		List<Integer> order = RoadVisitOrder.shortestOpenPath(roads).orElseThrow();

		assertThat(order).containsExactly(0, 2, 1);
		assertThat(total(roads, order)).isGreaterThan(BigInteger.valueOf(Long.MAX_VALUE));
	}

	@Test
	@DisplayName("잘못된 거리 행렬은 명확하게 거부한다")
	void rejects_invalid_matrices() {
		assertThatIllegalArgumentException().isThrownBy(() -> RoadVisitOrder.shortestOpenPath(null));
		assertThatIllegalArgumentException().isThrownBy(() -> RoadVisitOrder.shortestOpenPath(new long[][] {null}));
		assertThatIllegalArgumentException().isThrownBy(() -> RoadVisitOrder.shortestOpenPath(new long[][] {{0, 1}}));
		assertThatIllegalArgumentException().isThrownBy(() -> RoadVisitOrder.shortestOpenPath(new long[][] {{0, -1}, {1, 0}}));
		assertThatIllegalArgumentException().isThrownBy(() -> RoadVisitOrder.shortestOpenPath(new long[][] {{1}}));
	}

	private static BigInteger total(long[][] roads, List<Integer> order) {
		BigInteger result = BigInteger.ZERO;
		for (int position = 1; position < order.size(); position++) {
			result = result.add(BigInteger.valueOf(roads[order.get(position - 1)][order.get(position)]));
		}
		return result;
	}
}
