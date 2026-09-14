package taedonghee.plan_fix.application.course.ai;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class RoadCourseOptimizerTest {
    private final RoadDistanceProvider provider = mock(RoadDistanceProvider.class);
    private final RoadCourseOptimizer optimizer = new RoadCourseOptimizer(provider);

    @Test
    void 실제_도로거리로_일차별_순서만_변경하고_원본은_유지한다() {
        List<SpotModel> day = new ArrayList<>(List.of(spot(1), spot(2), spot(3)));
        when(provider.distances(day)).thenReturn(Optional.of(new long[][] {
            {0, 9000, 1000}, {1000, 0, 9000}, {9000, 1000, 0}
        }));
        List<RoadCourseOptimizer.Result> result = optimizer.optimizeDays(List.of(day, List.of(spot(4))));

        assertThat(result.get(0).spots()).extracting(SpotModel::spotId).containsExactly(1L, 3L, 2L);
        assertThat(result.get(0).drivingDistanceMeters()).isEqualTo(2000L);
        assertThat(result.get(0).routeStatus()).isEqualTo("ROAD_DISTANCE");
        assertThat(day).extracting(SpotModel::spotId).containsExactly(1L, 2L, 3L);
        assertThat(result.get(1).spots()).extracting(SpotModel::spotId).containsExactly(4L);
        assertThat(result.get(1).routeStatus()).isEqualTo("NOT_NEEDED");
        verify(provider, times(1)).distances(anyList());
    }

    @Test
    void 조회가_실패한_일차는_추천순서를_유지하고_다른_날은_최적화한다() {
        List<SpotModel> first = List.of(spot(1), spot(2));
        List<SpotModel> second = List.of(spot(3), spot(4));
        when(provider.distances(first)).thenReturn(Optional.empty());
        when(provider.distances(second)).thenReturn(Optional.of(new long[][] {{0, 8000}, {2000, 0}}));

        List<RoadCourseOptimizer.Result> result = optimizer.optimizeDays(List.of(first, second));
        assertThat(result.get(0).spots()).isEqualTo(first);
        assertThat(result.get(0).routeStatus()).isEqualTo("UNAVAILABLE");
        assertThat(result.get(0).drivingDistanceMeters()).isNull();
        assertThat(result.get(1).spots()).extracting(SpotModel::spotId).containsExactly(4L, 3L);
        assertThat(result.get(1).drivingDistanceMeters()).isEqualTo(2000L);
    }

    @Test
    void 연결된_전체경로가_없으면_최단거리라고_표시하지_않는다() {
        List<SpotModel> day = List.of(spot(1), spot(2));
        when(provider.distances(day)).thenReturn(Optional.of(new long[][] {{0, Long.MAX_VALUE}, {Long.MAX_VALUE, 0}}));
        assertThat(optimizer.optimizeDays(List.of(day)).get(0).routeStatus()).isEqualTo("UNAVAILABLE");
    }

    @Test
    void 장소가_너무_많거나_한곳_이하면_길찾기호출을_늘리지_않는다() {
        List<SpotModel> large = LongStream.rangeClosed(1, 11).mapToObj(this::spot).toList();
        List<RoadCourseOptimizer.Result> result = optimizer.optimizeDays(List.of(List.of(), List.of(spot(1)), large));
        assertThat(result).extracting(RoadCourseOptimizer.Result::routeStatus)
            .containsExactly("NOT_NEEDED", "NOT_NEEDED", "UNAVAILABLE");
        verifyNoInteractions(provider);
    }

    @Test
    void 잘못된_거리행렬은_장소를_유실시키지_않고_추천순서를_유지한다() {
        List<SpotModel> day = List.of(spot(1), spot(2));
        when(provider.distances(day)).thenReturn(Optional.of(new long[][] {{0}}));
        assertThat(optimizer.optimizeDays(List.of(day)).get(0).spots()).isEqualTo(day);
        when(provider.distances(day)).thenReturn(Optional.of(new long[][] {{0, -1}, {100, 0}}));
        assertThat(optimizer.optimizeDays(List.of(day)).get(0).routeStatus()).isEqualTo("UNAVAILABLE");
    }

    private SpotModel spot(long id) {
        return SpotModel.builder().spotId(id).title("장소 " + id).category("관광지")
            .sourceType(SpotSourceType.TOUR_API).build();
    }
}
