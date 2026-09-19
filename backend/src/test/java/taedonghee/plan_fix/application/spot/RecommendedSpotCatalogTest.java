package taedonghee.plan_fix.application.spot;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RecommendedSpotCatalogTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 배포_카탈로그는_강원_18개_시군별_대표_장소_20개씩_포함한다() throws Exception {
        try (var input = new ClassPathResource("recommended-gangwon-spots.json").getInputStream()) {
            var data = mapper.readValue(input, RecommendedSpotCatalog.Catalog.class);
            var catalog = new RecommendedSpotCatalog(mapper);
            assertThat(catalog.titles(null)).hasSize(360).doesNotHaveDuplicates();
            assertThat(data.places().stream().collect(Collectors.groupingBy(
                    RecommendedSpotCatalog.Place::sigungu, Collectors.counting())))
                    .hasSize(18).allSatisfy((sigungu, count) -> assertThat(count).isEqualTo(20));
            assertThat(catalog.titles("150")).hasSize(20)
                    .contains("경포해수욕장", "강릉 오죽헌·시립박물관", "정동진해변",
                            "테라로사 커피공장", "강릉짬뽕순두부 동화가든 본점", "강릉 중앙시장");
            assertThat(catalog.titles("999")).isEmpty();
            assertThat(catalog.titles("770")).hasSize(20)
                    .contains("국립 가리왕산자연휴양림", "오장폭포")
                    .doesNotContain("삼탄아트마인", "가리왕산케이블카");
        }
    }

    @Test
    void 손상되거나_지원하지_않는_카탈로그를_조용히_무시하지_않는다() {
        assertThatThrownBy(() -> load("invalid json")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> load("{\"version\":2,\"places\":[]}"))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> load("{\"version\":1,\"places\":[]}"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RecommendedSpotCatalog(mapper, new ClassPathResource("missing-spots.json")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 잘못된_시군구와_중복_장소를_거절한다() {
        var place = new RecommendedSpotCatalog.Place("남이섬", "110");
        assertThatThrownBy(() -> new RecommendedSpotCatalog(List.of(place, place)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RecommendedSpotCatalog(List.of(new RecommendedSpotCatalog.Place("남이섬", "1"))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new RecommendedSpotCatalog(List.of(new RecommendedSpotCatalog.Place("남이섬", "999"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 카탈로그_상한을_넘는_장소는_거절한다() {
        var places = IntStream.rangeClosed(1, 361)
                .mapToObj(i -> new RecommendedSpotCatalog.Place("장소 " + i, "110")).toList();
        assertThatThrownBy(() -> new RecommendedSpotCatalog(places))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("360");
    }

    private RecommendedSpotCatalog load(String json) {
        return new RecommendedSpotCatalog(mapper, new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8)));
    }
}
