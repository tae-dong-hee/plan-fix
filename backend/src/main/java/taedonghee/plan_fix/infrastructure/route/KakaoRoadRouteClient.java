package taedonghee.plan_fix.infrastructure.route;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** 카카오 자동차 길찾기의 실제 도로 좌표를 지도 표시용으로 조회한다. */
@Component
@EnableConfigurationProperties(KakaoRoadProperties.class)
public class KakaoRoadRouteClient {

    private static final String DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";
    /** 한 화면에서 외부 API를 과도하게 호출하지 않도록 장소 수를 제한한다. */
    private static final int MAX_POINTS = 10;

    private final KakaoRoadProperties properties;
    private final RestClient restClient;

    @Autowired
    public KakaoRoadRouteClient(KakaoRoadProperties properties) {
        this(properties, RestClient.builder().requestFactory(requestFactory()));
    }

    KakaoRoadRouteClient(KakaoRoadProperties properties, RestClient.Builder builder) {
        this.properties = properties;
        this.restClient = builder.build();
    }

    public Optional<List<List<Point>>> route(List<Point> points) {
        if (properties.apiKey() == null || properties.apiKey().isBlank() || points == null
                || points.size() < 2 || points.size() > MAX_POINTS || points.stream().anyMatch(point -> !valid(point))) {
            return Optional.empty();
        }
        List<List<Point>> segments = new ArrayList<>();
        for (int index = 1; index < points.size(); index++) {
            Point origin = points.get(index - 1);
            Point destination = points.get(index);
            // 동일 위치의 연속 방문은 길찾기가 실패할 수 있으므로 이동 없는 구간으로 처리한다.
            if (origin.latitude().compareTo(destination.latitude()) == 0
                    && origin.longitude().compareTo(destination.longitude()) == 0) {
                segments.add(List.of(origin, destination));
                continue;
            }
            Optional<List<Point>> segment = fetch(points.get(index - 1), points.get(index));
            if (segment.isEmpty()) return Optional.empty();
            segments.add(segment.get());
        }
        return Optional.of(segments);
    }

    private Optional<List<Point>> fetch(Point origin, Point destination) {
        try {
            JsonNode body = restClient.get()
                    .uri(UriComponentsBuilder.fromUriString(DIRECTIONS_URL)
                            .queryParam("origin", coordinate(origin.longitude()) + "," + coordinate(origin.latitude()))
                            .queryParam("destination", coordinate(destination.longitude()) + "," + coordinate(destination.latitude()))
                            .queryParam("priority", "DISTANCE")
                            .queryParam("summary", false).build().toUri())
                    .header("Authorization", "KakaoAK " + properties.apiKey())
                    .retrieve().body(JsonNode.class);
            JsonNode route = body == null ? null : body.path("routes").path(0);
            if (route == null || !route.path("result_code").isIntegralNumber() || route.path("result_code").intValue() != 0) {
                return Optional.empty();
            }
            List<Point> path = new ArrayList<>();
            for (JsonNode section : route.path("sections")) {
                for (JsonNode road : section.path("roads")) {
                    JsonNode vertexes = road.path("vertexes");
                    if (!vertexes.isArray() || vertexes.size() < 2 || vertexes.size() % 2 != 0) return Optional.empty();
                    for (int i = 0; i < vertexes.size(); i += 2) {
                        if (!vertexes.path(i).isNumber() || !vertexes.path(i + 1).isNumber()) return Optional.empty();
                        Point point = new Point(BigDecimal.valueOf(vertexes.path(i + 1).doubleValue()),
                                BigDecimal.valueOf(vertexes.path(i).doubleValue()));
                        if (!valid(point)) return Optional.empty();
                        if (path.isEmpty() || !path.getLast().equals(point)) path.add(point);
                    }
                }
            }
            return path.size() >= 2 ? Optional.of(path) : Optional.empty();
        } catch (RestClientException e) {
            return Optional.empty();
        }
    }

    private static SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(5));
        return factory;
    }

    private static boolean valid(Point point) {
        return point != null && point.latitude() != null && point.longitude() != null
                && point.latitude().abs().compareTo(BigDecimal.valueOf(90)) <= 0
                && point.longitude().abs().compareTo(BigDecimal.valueOf(180)) <= 0
                && !(point.latitude().signum() == 0 && point.longitude().signum() == 0);
    }

    private static String coordinate(BigDecimal coordinate) {
        return coordinate.stripTrailingZeros().toPlainString();
    }

    public record Point(BigDecimal latitude, BigDecimal longitude) { }
}
