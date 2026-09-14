package taedonghee.plan_fix.application.course.ai;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** Finds the shortest directed route through every stop, without a fixed start or a return trip. */
public final class RoadVisitOrder {

	private static final int MAX_STOPS = 10;

	private RoadVisitOrder() {
	}

	/**
	 * Distances are nonnegative meters; {@link Long#MAX_VALUE} means a road is unreachable.
	 * Equal-distance routes use lexicographic input-index order, preserving the original order
	 * when it is equally short. Returns empty when no complete route exists or there are over
	 * ten stops. Runtime is O(n² 2ⁿ), with exact totals even when their sum exceeds a long.
	 *
	 * @throws IllegalArgumentException if the matrix is null, nonsquare, negative or has a nonzero diagonal
	 */
	public static Optional<List<Integer>> shortestOpenPath(long[][] distancesMeters) {
		validate(distancesMeters);
		int count = distancesMeters.length;
		if (count > MAX_STOPS) {
			return Optional.empty();
		}
		if (count == 0) {
			return Optional.of(List.of());
		}

		int stateCount = 1 << count;
		BigInteger[][] costs = new BigInteger[stateCount][count];
		long[][] orders = new long[stateCount][count];
		for (int start = 0; start < count; start++) {
			costs[1 << start][start] = BigInteger.ZERO;
			orders[1 << start][start] = start;
		}

		for (int visited = 1; visited < stateCount; visited++) {
			for (int last = 0; last < count; last++) {
				if (costs[visited][last] == null) {
					continue;
				}
				for (int next = 0; next < count; next++) {
					long distance = distancesMeters[last][next];
					if ((visited & (1 << next)) != 0 || distance == Long.MAX_VALUE) {
						continue;
					}
					int extended = visited | (1 << next);
					BigInteger candidate = costs[visited][last].add(BigInteger.valueOf(distance));
					// Each index fits in four bits. Equal-length encodings compare lexicographically.
					long order = (orders[visited][last] << 4) | next;
					BigInteger current = costs[extended][next];
					if (current == null || candidate.compareTo(current) < 0
						|| (candidate.equals(current) && order < orders[extended][next])) {
						costs[extended][next] = candidate;
						orders[extended][next] = order;
					}
				}
			}
		}

		BigInteger minimum = null;
		long bestOrder = 0;
		for (int last = 0; last < count; last++) {
			BigInteger cost = costs[stateCount - 1][last];
			long order = orders[stateCount - 1][last];
			if (cost != null && (minimum == null || cost.compareTo(minimum) < 0
				|| (cost.equals(minimum) && order < bestOrder))) {
				minimum = cost;
				bestOrder = order;
			}
		}
		if (minimum == null) {
			return Optional.empty();
		}
		List<Integer> result = new ArrayList<>(count);
		for (int position = count - 1; position >= 0; position--) {
			result.add((int) ((bestOrder >>> (position * 4)) & 15));
		}
		return Optional.of(List.copyOf(result));
	}

	private static void validate(long[][] distances) {
		if (distances == null) {
			throw new IllegalArgumentException("Road distances must not be null");
		}
		for (int row = 0; row < distances.length; row++) {
			if (distances[row] == null || distances[row].length != distances.length) {
				throw new IllegalArgumentException("Road distances must form a square matrix");
			}
			for (int column = 0; column < distances.length; column++) {
				if (distances[row][column] < 0) {
					throw new IllegalArgumentException("Road distances must be nonnegative");
				}
			}
			if (distances[row][row] != 0) {
				throw new IllegalArgumentException("Road distances must have a zero diagonal");
			}
		}
	}
}
