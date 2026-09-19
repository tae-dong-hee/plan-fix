package taedonghee.plan_fix.interfaces.api.spot;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.application.spot.RecommendedSpotCatalog;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;

import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** 실제 카탈로그 → 임시 PostgreSQL → 공개 API → 카탈로그를 양방향으로 대조한다. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class RecommendedSpotIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired SpotRepository spots;

    @Test
    void 전체_360곳과_시군별_20곳을_누락_혼입_중복없이_반환한다() throws Exception {
        RecommendedSpotCatalog.Catalog catalog;
        try (var input = new ClassPathResource("recommended-gangwon-spots.json").getInputStream()) {
            catalog = mapper.readValue(input, RecommendedSpotCatalog.Catalog.class);
        }
        int index = 0;
        for (var place : catalog.places()) {
            String category = switch (index++ % 3) {
                case 1 -> "카페/음료";
                case 2 -> "음식점";
                default -> "관광지";
            };
            save(place.title(), place.sigungu(), "51", category, SpotSourceType.TOUR_API, SpotStatus.ACTIVE);
        }
        var first = catalog.places().getFirst();
        save(first.title(), first.sigungu(), "51", "관광지", SpotSourceType.TOUR_API, SpotStatus.ACTIVE);
        save(first.title(), "999", "51", "관광지", SpotSourceType.TOUR_API, SpotStatus.ACTIVE);
        save(first.title(), first.sigungu(), "11", "관광지", SpotSourceType.TOUR_API, SpotStatus.ACTIVE);
        save(first.title(), first.sigungu(), "51", "관광지", SpotSourceType.TOUR_API, SpotStatus.HIDDEN);
        save(first.title(), first.sigungu(), "51", "관광지", SpotSourceType.NATIVE, SpotStatus.ACTIVE);
        save("미선정 장소", first.sigungu(), "51", "음식점", SpotSourceType.TOUR_API, SpotStatus.ACTIVE);

        Set<String> returned = new HashSet<>();
        for (String district : catalog.places().stream().map(RecommendedSpotCatalog.Place::sigungu).distinct().toList()) {
            var response = mvc.perform(get("/api/v1/spots/recommended").param("region", "51")
                            .param("sigungu", district).param("size", "20"))
                    .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(jsonPath("$.totalCount").value(20)).andExpect(jsonPath("$.items.length()").value(20))
                    .andReturn().getResponse();
            Set<String> actual = new HashSet<>();
            for (var item : mapper.readTree(response.getContentAsString()).get("items")) {
                assertThat(item.get("sigungu").asText()).isEqualTo(district);
                assertThat(actual.add(item.get("title").asText())).isTrue();
                assertThat(returned.add(district + ":" + item.get("title").asText())).isTrue();
            }
            assertThat(actual).containsExactlyInAnyOrderElementsOf(catalog.places().stream()
                    .filter(p -> district.equals(p.sigungu())).map(RecommendedSpotCatalog.Place::title).toList());
        }
        assertThat(returned).isEqualTo(catalog.places().stream()
                .map(p -> p.sigungu() + ":" + p.title()).collect(Collectors.toSet()));
        mvc.perform(get("/api/v1/spots/recommended").param("size", "100"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalCount").value(360))
                .andExpect(jsonPath("$.items.length()").value(100));
        mvc.perform(get("/api/v1/spots/recommended").param("region", "11"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalCount").value(0));
        mvc.perform(get("/api/v1/spots/recommended").param("size", "101"))
                .andExpect(status().isBadRequest());
    }

    private void save(String title, String district, String region, String category, SpotSourceType source, SpotStatus status) {
        spots.save(SpotModel.builder().title(title).sigungu(district).region(region).category(category)
                .sourceType(source).status(status).build());
    }
}
