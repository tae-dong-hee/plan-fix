package taedonghee.plan_fix.application.course.ai;

import org.springframework.stereotype.Component;
import taedonghee.plan_fix.domain.spot.SpotModel;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;

/** 날짜별로 선택된 장소는 유지하고, 실제 자동차 도로거리 합계가 최소인 순서를 찾는다. */
@Component
public class RoadCourseOptimizer {
    private static final long REQUEST_BUDGET_NANOS = TimeUnit.SECONDS.toNanos(30);
    private final RoadDistanceProvider distanceProvider;

    public RoadCourseOptimizer(RoadDistanceProvider distanceProvider) {
        this.distanceProvider = distanceProvider;
    }

    public List<Result> optimizeDays(List<List<SpotModel>> days) {
        long started = System.nanoTime();
        List<Result> results = new ArrayList<>();
        for (List<SpotModel> day : days) {
            if (day.size() < 2) {
                results.add(new Result(List.copyOf(day), "NOT_NEEDED", 0L));
            } else if (System.nanoTime() - started >= REQUEST_BUDGET_NANOS || day.size() > 10) {
                results.add(unavailable(day));
            } else {
                results.add(optimize(day));
            }
        }
        return results;
    }

    private Result optimize(List<SpotModel> spots) {
        Optional<long[][]> distances = distanceProvider.distances(spots);
        if (distances.isEmpty()) return unavailable(spots);
        long[][] matrix = distances.get();
        if (matrix.length != spots.size()) return unavailable(spots);
        try {
            Optional<List<Integer>> order = RoadVisitOrder.shortestOpenPath(matrix);
            if (order.isEmpty()) return unavailable(spots);

            List<Integer> indexes = order.get();
            long total = 0;
            for (int i = 1; i < indexes.size(); i++) {
                total = Math.addExact(total, matrix[indexes.get(i - 1)][indexes.get(i)]);
            }
            return new Result(indexes.stream().map(spots::get).toList(), "ROAD_DISTANCE", total);
        } catch (IllegalArgumentException | ArithmeticException invalidDistances) {
            return unavailable(spots);
        }
    }

    private Result unavailable(List<SpotModel> spots) {
        return new Result(List.copyOf(spots), "UNAVAILABLE", null);
    }

    public record Result(List<SpotModel> spots, String routeStatus, Long drivingDistanceMeters) {}
}
