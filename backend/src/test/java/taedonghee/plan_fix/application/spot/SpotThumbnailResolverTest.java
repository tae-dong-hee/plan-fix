package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class SpotThumbnailResolverTest {

    @Test
    void 대표사진을_유지하고_누락된_장소들만_한번에_조회한다() {
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        SpotModel representative = spot(4L, "https://example.com/cover.jpg", SpotSourceType.TOUR_API);
        SpotModel detailOnly = spot(15L, null, SpotSourceType.TOUR_API);
        SpotModel blank = spot(38L, "  ", SpotSourceType.TOUR_API);
        SpotModel nativeSpot = spot(50L, null, SpotSourceType.NATIVE);
        when(images.findBySpotIds(Set.of(15L, 38L))).thenReturn(List.of(
                new SpotImageCandidate(15L, "https://example.com/first.jpg", null),
                new SpotImageCandidate(15L, "https://example.com/second.jpg", null)));

        var result = new SpotThumbnailResolver(images).resolve(List.of(representative, detailOnly, blank, nativeSpot));

        assertThat(result).containsOnly(
                org.assertj.core.api.Assertions.entry(4L, "https://example.com/cover.jpg"),
                org.assertj.core.api.Assertions.entry(15L, "https://example.com/first.jpg"));
        assertThat(detailOnly.thumbnail()).isNull();
        assertThat(blank.thumbnail()).isEqualTo("  ");
        verify(images).findBySpotIds(Set.of(15L, 38L));
        verifyNoMoreInteractions(images);
    }

    @Test
    void 잘못된_사진은_건너뛰고_원본이_없으면_작은사진도_사용한다() {
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        when(images.findBySpotIds(Set.of(1L, 2L))).thenReturn(List.of(
                new SpotImageCandidate(1L, "new.jpg", "javascript:alert(1)"),
                new SpotImageCandidate(1L, "https://example.com/valid.jpg", null),
                new SpotImageCandidate(2L, "  ", " https://example.com/small.jpg ")));

        var result = new SpotThumbnailResolver(images).resolve(List.of(
                spot(1L, null, SpotSourceType.TOUR_API), spot(2L, null, SpotSourceType.TOUR_API)));

        assertThat(result).containsEntry(1L, "https://example.com/valid.jpg")
                .containsEntry(2L, "https://example.com/small.jpg");
    }

    @Test
    void 대표사진이_있거나_목록이_비면_상세사진을_조회하지_않는다() {
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        SpotThumbnailResolver resolver = new SpotThumbnailResolver(images);

        assertThat(resolver.resolve(List.of())).isEmpty();
        assertThat(resolver.resolve(List.of(spot(1L, "cover.jpg", SpotSourceType.NATIVE))))
                .containsEntry(1L, "cover.jpg");
        verifyNoInteractions(images);
    }

    @Test
    void 상세화면은_대표사진을_우선하고_이미_조회한_사진으로_대체한다() {
        assertThat(SpotThumbnailResolver.select("cover.jpg", List.of("https://example.com/detail.jpg")))
                .isEqualTo("cover.jpg");
        assertThat(SpotThumbnailResolver.select(null, Arrays.asList(null, "", "bad.jpg", "https://example.com/detail.jpg")))
                .isEqualTo("https://example.com/detail.jpg");
        assertThat(SpotThumbnailResolver.select(" ", List.of("broken path", "file:///tmp/photo.jpg"))).isNull();
    }

    private SpotModel spot(long id, String thumbnail, SpotSourceType source) {
        return SpotModel.builder().spotId(id).sourceType(source).title("장소").category("관광지")
                .thumbnail(thumbnail).build();
    }
}
