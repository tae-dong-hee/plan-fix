package taedonghee.plan_fix.application.spot;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class VerifiedSpotPhotoCatalogTest {

    private static final Long SPOT_ID = 796L;
    private static final String TITLE = "루소호텔";
    private static final String ADDRESS = "강원특별자치도 강릉시 교동광장로100번길 12 (교동)";
    private static final BigDecimal LATITUDE = new BigDecimal("37.7659694");
    private static final BigDecimal LONGITUDE = new BigDecimal("128.8764709");
    private static final String URL = "/images/verified-spots/russo-hotel.webp";
    private final ObjectMapper mapper = new ObjectMapper();
    private final VerifiedSpotPhotoCatalog.Photo photo = new VerifiedSpotPhotoCatalog.Photo(
            SPOT_ID, TITLE, ADDRESS, LATITUDE, LONGITUDE, URL);
    private final VerifiedSpotPhotoCatalog catalog = new VerifiedSpotPhotoCatalog(List.of(photo));

    @Test
    void 빈_원본사진은_정확한_장소만_보완하고_좌표의_소수자릿수는_무시한다() {
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS,
                LATITUDE.setScale(10), LONGITUDE.setScale(10), null)).isEqualTo(URL);
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS, LATITUDE, LONGITUDE, "  ")).isEqualTo(URL);
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS, LATITUDE, LONGITUDE, "")).isEqualTo(URL);
    }

    @Test
    void 기존_API사진이_있으면_항상_그대로_사용한다() {
        String source = "https://tong.visitkorea.or.kr/source.jpg";
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS, LATITUDE, LONGITUDE, source)).isEqualTo(source);
        assertThat(catalog.thumbnailFor(SPOT_ID, "변경된 이름", ADDRESS, LATITUDE, LONGITUDE, source)).isEqualTo(source);
    }

    @Test
    void 이름과_주소가_같아도_다른_ID의_인접_장소에_사진을_빌려주지_않는다() {
        assertThat(catalog.thumbnailFor(SPOT_ID + 1, TITLE, ADDRESS, LATITUDE, LONGITUDE, null)).isNull();
        assertThat(catalog.thumbnailFor(null, TITLE, ADDRESS, LATITUDE, LONGITUDE, null)).isNull();
    }

    @Test
    void 검수_후_이름이나_주소가_바뀌면_이전_사진을_사용하지_않는다() {
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE + " 별관", ADDRESS, LATITUDE, LONGITUDE, null)).isNull();
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS + " 2층", LATITUDE, LONGITUDE, null)).isNull();
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE + " ", ADDRESS, LATITUDE, LONGITUDE, null)).isNull();
        assertThat(catalog.thumbnailFor(SPOT_ID, null, ADDRESS, LATITUDE, LONGITUDE, null)).isNull();
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, null, LATITUDE, LONGITUDE, null)).isNull();
    }

    @Test
    void 좌표가_조금이라도_바뀌거나_누락되면_사진을_사용하지_않는다() {
        BigDecimal offset = new BigDecimal("0.0000001");
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS, LATITUDE.add(offset), LONGITUDE, null)).isNull();
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS, LATITUDE, LONGITUDE.add(offset), null)).isNull();
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS, null, LONGITUDE, null)).isNull();
        assertThat(catalog.thumbnailFor(SPOT_ID, TITLE, ADDRESS, LATITUDE, null, null)).isNull();
    }

    @Test
    void 카탈로그에_없는_일반_스팟은_기존_빈값도_그대로_반환한다() {
        assertThat(catalog.thumbnailFor(999999L, TITLE, ADDRESS, LATITUDE, LONGITUDE, null)).isNull();
        assertThat(catalog.thumbnailFor(999999L, TITLE, ADDRESS, LATITUDE, LONGITUDE, " ")).isEqualTo(" ");
    }

    @Test
    void 배포_카탈로그를_읽을_수_있고_빈_검수목록도_허용한다() {
        new VerifiedSpotPhotoCatalog(mapper);
        assertThat(load("{\"version\":1,\"images\":[]}").thumbnailFor(
                SPOT_ID, TITLE, ADDRESS, LATITUDE, LONGITUDE, null)).isNull();
    }

    @Test
    void 손상된_매니페스트와_미지원_버전과_누락파일을_거절한다() {
        assertThatThrownBy(() -> load("invalid json")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> load("{\"version\":2,\"images\":[]}")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> load("{\"version\":1}")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new VerifiedSpotPhotoCatalog(mapper, new ClassPathResource("missing-photos.json")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 동일_ID의_다른_사진과_불완전한_식별정보를_거절한다() {
        assertThatThrownBy(() -> new VerifiedSpotPhotoCatalog(List.of(photo, photo)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new VerifiedSpotPhotoCatalog(List.of(new VerifiedSpotPhotoCatalog.Photo(
                SPOT_ID, TITLE, null, LATITUDE, LONGITUDE, URL)))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new VerifiedSpotPhotoCatalog(List.of(new VerifiedSpotPhotoCatalog.Photo(
                SPOT_ID, TITLE, ADDRESS, null, LONGITUDE, URL)))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new VerifiedSpotPhotoCatalog(List.of(new VerifiedSpotPhotoCatalog.Photo(
                SPOT_ID, TITLE, ADDRESS, LATITUDE, LONGITUDE, " ")))).isInstanceOf(IllegalArgumentException.class);
    }

    private VerifiedSpotPhotoCatalog load(String json) {
        return new VerifiedSpotPhotoCatalog(mapper, new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8)));
    }
}
