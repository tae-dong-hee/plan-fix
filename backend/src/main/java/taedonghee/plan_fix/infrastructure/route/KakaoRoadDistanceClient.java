package taedonghee.plan_fix.infrastructure.route;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import taedonghee.plan_fix.application.course.ai.RoadDistanceProvider;
import taedonghee.plan_fix.domain.spot.SpotModel;
import tools.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** 카카오가 조회한 방향별 최단 자동차 도로거리. 실패한 조회를 직선거리로 대체하지 않는다. */
@Component
@EnableConfigurationProperties(KakaoRoadProperties.class)
public class KakaoRoadDistanceClient implements RoadDistanceProvider {

    private static final Logger log = LoggerFactory.getLogger(KakaoRoadDistanceClient.class);
    private static final String DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";
    private static final int MAX_SPOTS = 10;
    private static final int MAX_CACHE_ENTRIES = 2_000;
    private static final Duration CACHE_TTL = Duration.ofMinutes(10);
    private static final Duration BATCH_TIMEOUT = Duration.ofSeconds(20);

    private final KakaoRoadProperties properties;
    private final RestClient restClient;
    private final Duration batchTimeout;
    private final Clock clock;
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            4, 4, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(90),
            Thread.ofPlatform().daemon().name("kakao-road-", 0).factory());
    private final Map<Leg, CachedDistance> cache = new LinkedHashMap<>(128, .75f, true);

    @Autowired
    public KakaoRoadDistanceClient(KakaoRoadProperties properties) {
        this(properties, RestClient.builder().requestFactory(requestFactory()));
    }

    KakaoRoadDistanceClient(KakaoRoadProperties properties, RestClient.Builder builder) {
        this(properties, builder, BATCH_TIMEOUT, Clock.systemUTC());
    }

    KakaoRoadDistanceClient(KakaoRoadProperties properties, RestClient.Builder builder,
                            Duration batchTimeout, Clock clock) {
        this.properties = properties;
        this.restClient = builder.build();
        this.batchTimeout = batchTimeout;
        this.clock = clock;
    }

    private static SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(5));
        return factory;
    }

    @Override
    public Optional<long[][]> distances(List<SpotModel> spots) {
        if (properties.apiKey() == null || properties.apiKey().isBlank()
                || spots == null || spots.size() > MAX_SPOTS
                || spots.stream().anyMatch(spot -> !validCoordinates(spot))) {
            return Optional.empty();
        }
        List<String> coordinates = spots.stream().map(spot -> coordinate(spot.longitude())
                + "," + coordinate(spot.latitude())).toList();
        Map<Leg, Long> results = new LinkedHashMap<>();
        Map<Leg, Future<OptionalLong>> pending = new LinkedHashMap<>();
        long deadline = System.nanoTime() + batchTimeout.toNanos();
        try {
            for (int from = 0; from < spots.size(); from++) {
                for (int to = 0; to < spots.size(); to++) {
                    if (from == to) continue;
                    Leg leg = new Leg(coordinates.get(from), coordinates.get(to));
                    if (results.containsKey(leg) || pending.containsKey(leg)) continue;
                    OptionalLong cached = cached(leg);
                    if (cached.isPresent()) {
                        results.put(leg, cached.getAsLong());
                    } else {
                        pending.put(leg, executor.submit(() -> fetch(leg, deadline)));
                    }
                }
            }
            for (Map.Entry<Leg, Future<OptionalLong>> entry : pending.entrySet()) {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) return Optional.empty();
                OptionalLong distance = entry.getValue().get(remaining, TimeUnit.NANOSECONDS);
                if (distance.isEmpty()) return Optional.empty();
                results.put(entry.getKey(), distance.getAsLong());
            }
            long[][] matrix = new long[spots.size()][spots.size()];
            for (int from = 0; from < spots.size(); from++) {
                for (int to = 0; to < spots.size(); to++) {
                    if (from != to) {
                        matrix[from][to] = results.get(new Leg(coordinates.get(from), coordinates.get(to)));
                    }
                }
            }
            return Optional.of(matrix);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (ExecutionException | TimeoutException | RejectedExecutionException e) {
            log.warn("도로 거리 일괄 조회를 완료하지 못했습니다.");
            return Optional.empty();
        } finally {
            pending.values().forEach(future -> future.cancel(true));
            executor.purge();
        }
    }

    private OptionalLong fetch(Leg leg, long deadline) {
        if (Thread.currentThread().isInterrupted() || System.nanoTime() >= deadline) {
            return OptionalLong.empty();
        }
        OptionalLong cached = cached(leg);
        if (cached.isPresent()) return cached;
        try {
            JsonNode body = restClient.get()
                    .uri(UriComponentsBuilder.fromUriString(DIRECTIONS_URL)
                            .queryParam("origin", leg.origin())
                            .queryParam("destination", leg.destination())
                            .queryParam("priority", "DISTANCE")
                            .queryParam("summary", true).build().toUri())
                    .header("Authorization", "KakaoAK " + properties.apiKey())
                    .retrieve().body(JsonNode.class);
            if (body == null || !body.path("routes").isArray() || body.path("routes").size() != 1) {
                return OptionalLong.empty();
            }
            JsonNode route = body.path("routes").path(0);
            JsonNode code = route.path("result_code");
            if (!code.isIntegralNumber() || !code.canConvertToInt()) return OptionalLong.empty();
            if (code.intValue() == 1) return OptionalLong.of(Long.MAX_VALUE);
            if (code.intValue() != 0) return OptionalLong.empty();
            JsonNode distance = route.path("summary").path("distance");
            if (!distance.isIntegralNumber() || !distance.canConvertToLong()
                    || distance.longValue() < 0 || distance.longValue() == Long.MAX_VALUE) {
                return OptionalLong.empty();
            }
            if (!Thread.currentThread().isInterrupted() && System.nanoTime() < deadline) {
                cache(leg, distance.longValue());
            }
            return OptionalLong.of(distance.longValue());
        } catch (RestClientResponseException e) {
            log.warn("도로 거리 조회 실패: HTTP {}", e.getStatusCode().value());
            return OptionalLong.empty();
        } catch (RestClientException e) {
            log.warn("도로 거리 조회에 실패했습니다.");
            return OptionalLong.empty();
        }
    }

    private synchronized OptionalLong cached(Leg leg) {
        CachedDistance value = cache.get(leg);
        if (value == null) return OptionalLong.empty();
        if (clock.millis() >= value.expiresAtMillis()) {
            cache.remove(leg);
            return OptionalLong.empty();
        }
        return OptionalLong.of(value.distance());
    }

    private synchronized void cache(Leg leg, long distance) {
        cache.put(leg, new CachedDistance(distance, clock.millis() + CACHE_TTL.toMillis()));
        while (cache.size() > MAX_CACHE_ENTRIES) cache.remove(cache.keySet().iterator().next());
    }

    private static boolean validCoordinates(SpotModel spot) {
        return spot != null && within(spot.latitude(), 90) && within(spot.longitude(), 180)
                && !(spot.latitude().signum() == 0 && spot.longitude().signum() == 0);
    }

    private static boolean within(BigDecimal coordinate, int max) {
        return coordinate != null && coordinate.abs().compareTo(BigDecimal.valueOf(max)) <= 0;
    }

    private static String coordinate(BigDecimal coordinate) {
        return coordinate.stripTrailingZeros().toPlainString();
    }

    @PreDestroy
    public void close() {
        executor.shutdownNow();
    }

    private record Leg(String origin, String destination) { }
    private record CachedDistance(long distance, long expiresAtMillis) { }
}
