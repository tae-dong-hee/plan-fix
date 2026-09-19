package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.infrastructure.spot.AreaBasedListItem;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** DB와 외부 API 없이 재수집 경로와 원본/서비스 이미지의 분리를 검증한다. */
class VerifiedSpotPhotoCollectionTest {

    private static final long SPOT_ID = 796L;
    private static final long CONTENT_ID = 3536362L;
    private static final String TITLE = "루소호텔";
    private static final String ADDRESS = "강원특별자치도 강릉시 교동광장로100번길 12 (교동)";
    private static final String URL = "/images/verified-spots/russo-hotel.webp";
    private final TourApiClient client = mock(TourApiClient.class);
    private final SpotRepository spots = mock(SpotRepository.class);
    private final TourDataSpotRepository tourSpots = mock(TourDataSpotRepository.class);
    private final VerifiedSpotPhotoCatalog catalog = new VerifiedSpotPhotoCatalog(List.of(
            new VerifiedSpotPhotoCatalog.Photo(SPOT_ID, TITLE, ADDRESS,
                    new BigDecimal("37.7659694"), new BigDecimal("128.8764709"), URL)));
    private final TourDataSpotCollectApplicationService service = new TourDataSpotCollectApplicationService(
            client, new TourApiProperties("", "", "ETC", "test", 100, 0, 100, 100), spots, tourSpots, catalog);

    @BeforeEach
    void setup() {
        when(client.fetchTotalCount(anyString(), anyString(), anyInt())).thenReturn(0);
        when(client.fetchTotalCount("51", "150", 32)).thenReturn(1);
    }

    @Test
    void 재수집은_검수사진을_canonical에만_반영하고_관광공사_원본의_빈값은_보존한다() {
        TourDataSpotModel existing = givenExisting(SPOT_ID);
        givenPage(TITLE, null);

        service.collect("51", "150");

        assertThat(updatedAttributes(SPOT_ID).thumbnail()).isEqualTo(URL);
        verify(tourSpots).save(existing);
        assertThat(existing.thumbnail()).isNull();
    }

    @Test
    void 재수집시_관광공사_사진이_생기면_검수사진보다_우선한다() {
        TourDataSpotModel existing = givenExisting(SPOT_ID);
        givenPage(TITLE, "https://tong.visitkorea.or.kr/new.jpg");

        service.collect("51", "150");

        assertThat(updatedAttributes(SPOT_ID).thumbnail()).isEqualTo(existing.thumbnail())
                .isEqualTo("https://tong.visitkorea.or.kr/new.jpg");
    }

    @Test
    void 재수집시_이름이_달라진_스팟에는_검수사진이_남지_않는다() {
        givenExisting(SPOT_ID);
        givenPage(TITLE + " 별관", null);

        service.collect("51", "150");

        assertThat(updatedAttributes(SPOT_ID).thumbnail()).isNull();
    }

    @Test
    void 검수목록에_없는_ID는_보완하지_않는다() {
        givenExisting(SPOT_ID + 1);
        givenPage(TITLE, null);

        service.collect("51", "150");

        assertThat(updatedAttributes(SPOT_ID + 1).thumbnail()).isNull();
    }

    @Test
    void 신규_스팟의_ID가_우연히_검수목록과_겹쳐도_신규_생성에는_관여하지_않는다() {
        when(tourSpots.findByContentId(CONTENT_ID)).thenReturn(Optional.empty());
        givenPage(TITLE, null);
        when(spots.save(any())).thenReturn(SpotModel.builder().spotId(SPOT_ID)
                .sourceType(SpotSourceType.TOUR_API).title(TITLE).category("숙박").build());

        service.collect("51", "150");

        ArgumentCaptor<SpotModel> created = ArgumentCaptor.forClass(SpotModel.class);
        verify(spots).save(created.capture());
        assertThat(created.getValue().thumbnail()).isNull();
        verify(spots, never()).updateTourApiListing(any(), any());
    }

    private TourDataSpotModel givenExisting(long spotId) {
        var existing = TourDataSpotModel.builder().contentId(CONTENT_ID).spotId(spotId)
                .title(TITLE).thumbnail("old-source.jpg").build();
        when(tourSpots.findByContentId(CONTENT_ID)).thenReturn(Optional.of(existing));
        return existing;
    }

    private void givenPage(String title, String thumbnail) {
        when(client.fetchPage("51", "150", 32, 1)).thenReturn(List.of(new AreaBasedListItem(
                String.valueOf(CONTENT_ID), "32", title, ADDRESS, "128.8764709", "37.7659694",
                thumbnail, "20240101000000", "25400", "51", "150", "AC01")));
    }

    private SpotModel.SourceAttributes updatedAttributes(long spotId) {
        ArgumentCaptor<SpotModel.SourceAttributes> attributes = ArgumentCaptor.forClass(SpotModel.SourceAttributes.class);
        verify(spots).updateTourApiListing(eq(spotId), attributes.capture());
        return attributes.getValue();
    }
}
