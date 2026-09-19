package taedonghee.plan_fix.infrastructure.spot;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TourApiClientTest {

	private HttpServer server;
	private final AtomicReference<String> responseBody = new AtomicReference<>();
	private final AtomicReference<String> nextPageBody = new AtomicReference<>();
	private final AtomicReference<String> requestQuery = new AtomicReference<>();
	private final AtomicReference<String> requestPath = new AtomicReference<>();
	private final AtomicInteger responseStatus = new AtomicInteger(200);
	private TourApiClient client;

	@BeforeEach
	void setUp() throws IOException {
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
		server.createContext("/", exchange -> {
			requestQuery.set(exchange.getRequestURI().getRawQuery());
			requestPath.set(exchange.getRequestURI().getPath());
			String json = requestQuery.get().contains("pageNo=2") && nextPageBody.get() != null
				? nextPageBody.get() : responseBody.get();
			byte[] body = json.getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().set("Content-Type", "application/json");
			exchange.sendResponseHeaders(responseStatus.get(), body.length);
			exchange.getResponseBody().write(body);
			exchange.close();
		});
		server.start();
		client = new TourApiClient(new TourApiProperties(
			"http://127.0.0.1:" + server.getAddress().getPort(), "test-key", "ETC", "test", 10, 0, 1_000, 1_000));
	}

	@AfterEach
	void tearDown() {
		server.stop(0);
	}

	@Test
	void HTTP_성공이어도_TourAPI_오류_코드면_빈_이미지로_바꾸지_않는다() {
		responseBody.set(response("30", "SERVICE_ERROR"));

		assertThatThrownBy(() -> client.fetchDetailImages(100L))
			.isInstanceOf(TourApiResponseException.class)
			.hasMessageContaining("resultCode=30");
	}

	@Test
	void 정상_응답에서_이미지가_없을_때만_빈_목록을_반환한다() {
		responseBody.set(response("0000", "OK"));

		assertThat(client.fetchDetailImages(100L)).isEmpty();
	}

	@Test
	void 공통정보_소개를_contentId로_가져온다() {
		responseBody.set("""
			{"response":{"header":{"resultCode":"0000","resultMsg":"OK"},"body":{"totalCount":1,"items":{"item":[
			{"contentid":"100","contenttypeid":"28","overview":"계곡 옆 캠핑장입니다.<br>예약 후 방문하세요.","title":"캠핑장"}
			]}}}}
			""");

		DetailCommonItem item = client.fetchDetailCommon(100L);

		assertThat(item.contentid()).isEqualTo("100");
		assertThat(item.overview()).isEqualTo("계곡 옆 캠핑장입니다.<br>예약 후 방문하세요.");
		assertThat(requestPath.get()).isEqualTo("/detailCommon2");
		assertThat(requestQuery.get()).contains("contentId=100", "_type=json", "MobileOS=ETC", "MobileApp=test")
			.doesNotContain("overviewYN", "defaultYN", "contentTypeId");
	}

	@Test
	void 공통정보가_없는_정상_응답은_null이다() {
		responseBody.set(response("0000", "OK"));

		assertThat(client.fetchDetailCommon(100L)).isNull();
	}

	@Test
	void 공통정보_API_실패를_빈_소개로_바꾸지_않는다() {
		responseBody.set(response("30", "SERVICE_ERROR"));

		assertThatThrownBy(() -> client.fetchDetailCommon(100L))
			.isInstanceOf(TourApiResponseException.class)
			.hasMessageContaining("detailCommon2");
	}

	@Test
	void 공통정보_응답_형식이_깨지면_빈_소개로_바꾸지_않는다() {
		responseBody.set("{}");

		assertThatThrownBy(() -> client.fetchDetailCommon(100L)).isInstanceOf(TourApiResponseException.class);
	}

	@Test
	void 공통정보_성공_헤더만_있고_body가_누락되면_실패다() {
		responseBody.set("""
			{"response":{"header":{"resultCode":"0000","resultMsg":"OK"}}}
			""");

		assertThatThrownBy(() -> client.fetchDetailCommon(100L)).isInstanceOf(TourApiResponseException.class);
	}

	@Test
	void 공통정보_콘텐츠_ID가_요청한_장소와_다르면_실패한다() {
		responseBody.set("""
			{"response":{"header":{"resultCode":"0000","resultMsg":"OK"},"body":{"totalCount":1,"items":{"item":[
			{"contentid":"999","overview":"다른 장소의 소개"}
			]}}}}
			""");

		assertThatThrownBy(() -> client.fetchDetailCommon(100L))
			.isInstanceOf(TourApiResponseException.class).hasMessageContaining("UNEXPECTED_CONTENT_ID");
	}

	@Test
	void 공통정보_전체건수가_양수인데_항목이_없으면_실패한다() {
		responseBody.set(response("0000", "OK").replace("\"totalCount\":0", "\"totalCount\":1"));

		assertThatThrownBy(() -> client.fetchDetailCommon(100L))
			.isInstanceOf(TourApiResponseException.class).hasMessageContaining("INCOMPLETE_RESPONSE");
	}

	@Test
	void HTTP_200_일일한도_오류를_구분한다() {
		responseBody.set(response("22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"));

		assertThatThrownBy(() -> client.fetchDetailCommon(100L)).isInstanceOf(TourApiQuotaExceededException.class);
	}

	@Test
	void HTTP_429_일일한도_오류를_구분한다() {
		responseStatus.set(429);
		responseBody.set(response("22", "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR"));

		assertThatThrownBy(() -> client.fetchDetailCommon(100L)).isInstanceOf(TourApiQuotaExceededException.class);
	}

	@Test
	void 반복정보_API는_요금과_시설_안내를_타입과_함께_조회한다() {
		responseBody.set("""
			{"response":{"header":{"resultCode":"0000","resultMsg":"OK"},"body":{"numOfRows":10,"pageNo":1,"totalCount":2,"items":{"item":[
			{"contentid":"100","contenttypeid":"28","infoname":"이용요금","infotext":"홈페이지 참고"},
			{"contentid":"100","contenttypeid":"28","infoname":"부대시설","infotext":"화장실, 샤워실"}
			]}}}}
			""");

		var items = client.fetchDetailInfo(100L, "28");

		assertThat(requestPath.get()).isEqualTo("/detailInfo2");
		assertThat(requestQuery.get()).contains("contentId=100", "contentTypeId=28");
		assertThat(items).extracting(DetailInfoItem::infoname).containsExactly("이용요금", "부대시설");
		assertThat(items.get(1).infotext()).isEqualTo("화장실, 샤워실");
	}

	@Test
	void 반복정보_정상_빈_응답과_API_실패를_구분한다() {
		responseBody.set(response("0000", "OK"));
		assertThat(client.fetchDetailInfo(100L, "28")).isEmpty();

		responseBody.set(response("30", "SERVICE_ERROR"));
		assertThatThrownBy(() -> client.fetchDetailInfo(100L, "28")).isInstanceOf(TourApiResponseException.class);
	}

	@Test
	void 반복정보_여러_페이지를_모두_가져온다() {
		responseBody.set(infoResponse("100", "시설", "화장실", 2));
		nextPageBody.set(infoResponse("100", "요금", "홈페이지 참고", 2));

		assertThat(client.fetchDetailInfo(100L, "28")).extracting(DetailInfoItem::infoname)
			.containsExactly("시설", "요금");
		assertThat(requestQuery.get()).contains("pageNo=2");
	}

	@Test
	void 반복정보의_일부라도_다른_장소이면_실패한다() {
		responseBody.set(infoResponse("100", "시설", "화장실", 2));
		nextPageBody.set(infoResponse("999", "요금", "다른 장소", 2));

		assertThatThrownBy(() -> client.fetchDetailInfo(100L, "28"))
			.isInstanceOf(TourApiResponseException.class).hasMessageContaining("UNEXPECTED_CONTENT_ID");
	}

	@Test
	void 반복정보_전체건수가_양수인데_항목이_없으면_실패한다() {
		responseBody.set(response("0000", "OK").replace("\"totalCount\":0", "\"totalCount\":1"));

		assertThatThrownBy(() -> client.fetchDetailInfo(100L, "28"))
			.isInstanceOf(TourApiResponseException.class).hasMessageContaining("INCOMPLETE_RESPONSE");
	}

	private String infoResponse(String contentId, String name, String description, int totalCount) {
		return """
			{"response":{"header":{"resultCode":"0000","resultMsg":"OK"},"body":{"numOfRows":1,"pageNo":1,"totalCount":%d,"items":{"item":[
			{"contentid":"%s","contenttypeid":"28","infoname":"%s","infotext":"%s"}
			]}}}}
			""".formatted(totalCount, contentId, name, description);
	}

	private String response(String resultCode, String resultMessage) {
		return """
			{"response":{"header":{"resultCode":"%s","resultMsg":"%s"},"body":{"items":"","numOfRows":0,"pageNo":1,"totalCount":0}}}
			""".formatted(resultCode, resultMessage);
	}
}
