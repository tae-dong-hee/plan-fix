package taedonghee.plan_fix.interfaces.api.route;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import taedonghee.plan_fix.infrastructure.route.KakaoRoadRouteClient;

import java.math.BigDecimal;
import java.util.List;

/** 지도 표시용 자동차 경로. 카카오 REST 키는 서버에만 보관한다. */
@RestController
@RequestMapping("/api/v1/routes")
@RequiredArgsConstructor
public class DrivingRouteController {
    private final KakaoRoadRouteClient routeClient;

    @PostMapping("/driving")
    public ResponseEntity<DrivingRouteResponse> driving(@RequestBody DrivingRouteRequest request) {
        List<KakaoRoadRouteClient.Point> points = request == null || request.points() == null ? List.of()
                : request.points().stream().map(point -> new KakaoRoadRouteClient.Point(point.latitude(), point.longitude())).toList();
        return routeClient.route(points)
                .map(paths -> ResponseEntity.ok(new DrivingRouteResponse(paths)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    public record DrivingRouteRequest(List<Point> points) { }
    public record Point(BigDecimal latitude, BigDecimal longitude) { }
    public record DrivingRouteResponse(List<List<KakaoRoadRouteClient.Point>> paths) { }
}
