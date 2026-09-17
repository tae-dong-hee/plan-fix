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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TourApiClientTest {

	private HttpServer server;
	private final AtomicReference<String> responseBody = new AtomicReference<>();
	private TourApiClient client;

	@BeforeEach
	void setUp() throws IOException {
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
		server.createContext("/detailImage2", exchange -> {
			byte[] body = responseBody.get().getBytes(StandardCharsets.UTF_8);
			exchange.getResponseHeaders().set("Content-Type", "application/json");
			exchange.sendResponseHeaders(200, body.length);
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

	private String response(String resultCode, String resultMessage) {
		return """
			{"response":{"header":{"resultCode":"%s","resultMsg":"%s"},"body":{"items":"","numOfRows":0,"pageNo":1,"totalCount":0}}}
			""".formatted(resultCode, resultMessage);
	}
}
