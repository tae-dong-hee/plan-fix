package taedonghee.plan_fix.infrastructure.route;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.springframework.test.web.client.ExpectedCount.between;
import static org.springframework.test.web.client.ExpectedCount.times;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class KakaoRoadDistanceClientTest {

    private static final KakaoRoadProperties PROPERTIES = new KakaoRoadProperties("test-road-key");
    private static final SpotModel FIRST = spot(1, "37.5", "127.1");
    private static final SpotModel SECOND = spot(2, "37.6", "127.2");
    private RestClient.Builder builder;
    private MockRestServiceServer server;
    private KakaoRoadDistanceClient client;

    @BeforeEach
    void setUp() {
        builder = RestClient.builder();
        server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
        client = new KakaoRoadDistanceClient(PROPERTIES, builder);
    }

    @AfterEach
    void tearDown() {
        client.close();
    }

    @Test
    void 방향별_도로거리를_최단거리_옵션으로_조회하고_좌표별로_재사용한다() {
        expectLeg("127.1,37.5", "127.2,37.6", 2300);
        expectLeg("127.2,37.6", "127.1,37.5", 5100);

        long[][] matrix = client.distances(List.of(FIRST, SECOND)).orElseThrow();
        assertThat(matrix[0]).containsExactly(0, 2300);
        assertThat(matrix[1]).containsExactly(5100, 0);

        // 스팟 ID와 소수점 자릿수가 달라도 같은 좌표의 동일 방향은 재호출하지 않는다.
        long[][] reused = client.distances(List.of(spot(7, "37.600", "127.200"), FIRST)).orElseThrow();
        assertThat(reused[0]).containsExactly(0, 5100);
        assertThat(reused[1]).containsExactly(2300, 0);
        server.verify();
    }

    @Test
    void 경로가_없는_방향은_무한대로_표시한다() {
        server.expect(queryParam("origin", "127.1,37.5"))
                .andRespond(withSuccess("{\"routes\":[{\"result_code\":1}]}", MediaType.APPLICATION_JSON));
        expectLeg("127.2,37.6", "127.1,37.5", 5100);

        long[][] matrix = client.distances(List.of(FIRST, SECOND)).orElseThrow();
        assertThat(matrix[0][1]).isEqualTo(Long.MAX_VALUE);
        assertThat(matrix[1][0]).isEqualTo(5100);
        server.verify();
    }

    @ParameterizedTest
    @MethodSource("invalidResponses")
    void 불완전한_응답과_탐색_오류를_직선거리로_바꾸지_않는다(String response) {
        server.expect(between(1, 2), anything()).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        assertThat(client.distances(List.of(FIRST, SECOND))).isEmpty();
        server.verify();
    }

    static Stream<String> invalidResponses() {
        return Stream.of(
                "{}", "{\"routes\":[]}", "{\"routes\":{}}", "not-json",
                "{\"routes\":[{\"result_code\":0}]}",
                "{\"routes\":[{\"result_code\":\"0\",\"summary\":{\"distance\":100}}]}",
                response("\"100\""), response("1.5"), response("-1"), response("9223372036854775808"),
                "{\"routes\":[{\"result_code\":104}]}",
                "{\"routes\":[{\"result_code\":102}]}",
                "{\"routes\":[{\"result_code\":103}]}",
                "{\"routes\":[{\"result_code\":105}]}",
                "{\"routes\":[{\"result_code\":106}]}");
    }

    @ParameterizedTest
    @MethodSource("httpErrors")
    void HTTP_오류는_조회_실패로_반환한다(HttpStatus status) {
        server.expect(between(1, 2), anything()).andRespond(withStatus(status));
        assertThat(client.distances(List.of(FIRST, SECOND))).isEmpty();
        server.verify();
    }

    static Stream<HttpStatus> httpErrors() {
        return Stream.of(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN,
                HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @Test
    void 인증_오류를_캐시하지_않고_다음_요청에서_다시_조회한다() {
        List<CountDownLatch> pairs = List.of(new CountDownLatch(2), new CountDownLatch(2));
        AtomicInteger requests = new AtomicInteger();
        server.expect(times(4), anything()).andRespond(request -> {
            CountDownLatch pair = pairs.get(requests.getAndIncrement() / 2);
            pair.countDown();
            try {
                if (!pair.await(2, TimeUnit.SECONDS)) throw new IOException("request timeout");
                return withStatus(HttpStatus.UNAUTHORIZED).createResponse(request);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("interrupted");
            }
        });

        assertThat(client.distances(List.of(FIRST, SECOND))).isEmpty();
        assertThat(client.distances(List.of(FIRST, SECOND))).isEmpty();
        server.verify();
    }

    @Test
    void 키가_없으면_API를_호출하지_않는다() {
        client.close();
        client = new KakaoRoadDistanceClient(new KakaoRoadProperties(" "), builder);
        assertThat(client.distances(List.of(FIRST, SECOND))).isEmpty();
        server.verify();
    }

    @Test
    void 좌표_누락과_범위_오류가_있거나_장소가_너무_많으면_API를_호출하지_않는다() {
        for (SpotModel invalid : List.of(spot(3, null, "127.3"), spot(3, "91", "127.3"),
                spot(3, "37.1", "181"), spot(3, "0", "0"))) {
            assertThat(client.distances(List.of(FIRST, invalid))).isEmpty();
        }
        assertThat(client.distances(IntStream.range(0, 11).mapToObj(i -> FIRST).toList())).isEmpty();
        server.verify();
    }

    @Test
    void 열_분_지난_성공_거리는_다시_조회한다() {
        AtomicLong time = new AtomicLong(0);
        Clock clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return Instant.ofEpochMilli(time.get()); }
        };
        client.close();
        client = new KakaoRoadDistanceClient(PROPERTIES, builder, Duration.ofSeconds(20), clock);
        server.expect(times(4), anything()).andRespond(withSuccess(response("3000"), MediaType.APPLICATION_JSON));

        assertThat(client.distances(List.of(FIRST, SECOND))).isPresent();
        time.set(Duration.ofMinutes(10).toMillis() - 1);
        assertThat(client.distances(List.of(FIRST, SECOND))).isPresent();
        time.incrementAndGet();
        assertThat(client.distances(List.of(FIRST, SECOND))).isPresent();
        server.verify();
    }

    @Test
    void 도로_조회는_동시에_최대_네_개까지만_실행한다() {
        AtomicInteger active = new AtomicInteger();
        AtomicInteger maximum = new AtomicInteger();
        CountDownLatch firstFour = new CountDownLatch(4);
        server.expect(times(6), anything()).andRespond(request -> {
            maximum.accumulateAndGet(active.incrementAndGet(), Math::max);
            firstFour.countDown();
            try {
                if (!firstFour.await(2, TimeUnit.SECONDS)) throw new IOException("concurrency timeout");
                return withSuccess(response("3000"), MediaType.APPLICATION_JSON).createResponse(request);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("interrupted");
            } finally {
                active.decrementAndGet();
            }
        });

        assertThat(client.distances(List.of(FIRST, SECOND, spot(3, "37.7", "127.3")))).isPresent();
        assertThat(maximum.get()).isEqualTo(4);
        server.verify();
    }

    @Test
    void 전체_조회_시간이_지나면_남은_작업을_취소한다() {
        client.close();
        client = new KakaoRoadDistanceClient(PROPERTIES, builder, Duration.ofMillis(100), Clock.systemUTC());
        CountDownLatch block = new CountDownLatch(1);
        CountDownLatch cancelled = new CountDownLatch(1);
        server.expect(between(1, 2), anything()).andRespond(request -> {
            try {
                block.await();
                throw new IOException("unexpected completion");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                cancelled.countDown();
                throw new IOException("interrupted");
            }
        });

        assertTimeoutPreemptively(Duration.ofSeconds(2), () -> {
            assertThat(client.distances(List.of(FIRST, SECOND))).isEmpty();
            assertThat(cancelled.await(1, TimeUnit.SECONDS)).isTrue();
        });
    }

    private void expectLeg(String origin, String destination, long distance) {
        server.expect(requestTo("https://apis-navi.kakaomobility.com/v1/directions?origin="
                        + origin + "&destination=" + destination + "&priority=DISTANCE&summary=true"))
                .andExpect(header("Authorization", "KakaoAK test-road-key"))
                .andRespond(withSuccess(response(Long.toString(distance)), MediaType.APPLICATION_JSON));
    }

    private static String response(String distance) {
        return "{\"routes\":[{\"result_code\":0,\"summary\":{\"distance\":" + distance + "}}]}";
    }

    private static SpotModel spot(long id, String latitude, String longitude) {
        return SpotModel.builder().spotId(id).sourceType(SpotSourceType.TOUR_API)
                .title("장소 " + id).category("관광")
                .latitude(latitude == null ? null : new BigDecimal(latitude))
                .longitude(longitude == null ? null : new BigDecimal(longitude)).build();
    }
}
