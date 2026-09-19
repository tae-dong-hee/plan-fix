package taedonghee.plan_fix.infrastructure.route;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class KakaoRoadRouteClientTest {

    @Test
    void 카카오의_경도_위도_vertexes를_지도용_위도_경도로_변환한다() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://apis-navi.kakaomobility.com/v1/directions?origin=127.1,37.5"
                        + "&destination=127.2,37.6&priority=DISTANCE&summary=false"))
                .andExpect(header("Authorization", "KakaoAK test-road-key"))
                .andRespond(withSuccess("""
                        {"routes":[{"result_code":0,"sections":[{"roads":[
                        {"vertexes":[127.1,37.5,127.15,37.55]},
                        {"vertexes":[127.15,37.55,127.2,37.6]}
                        ]}]}]}""", MediaType.APPLICATION_JSON));

        KakaoRoadRouteClient client = new KakaoRoadRouteClient(new KakaoRoadProperties("test-road-key"), builder);
        List<List<KakaoRoadRouteClient.Point>> paths = client.route(List.of(
                point("37.5", "127.1"), point("37.6", "127.2"))).orElseThrow();

        assertThat(paths).hasSize(1);
        assertThat(paths.getFirst()).containsExactly(point("37.5", "127.1"), point("37.55", "127.15"), point("37.6", "127.2"));
        server.verify();
    }

    @Test
    void same_location_does_not_request_directions() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        KakaoRoadRouteClient client = new KakaoRoadRouteClient(new KakaoRoadProperties("test-road-key"), builder);
        assertThat(client.route(List.of(point("37.5", "127.1"), point("37.50", "127.10")))).isPresent();
        server.verify();
    }

    private static KakaoRoadRouteClient.Point point(String latitude, String longitude) {
        return new KakaoRoadRouteClient.Point(new BigDecimal(latitude), new BigDecimal(longitude));
    }
}
