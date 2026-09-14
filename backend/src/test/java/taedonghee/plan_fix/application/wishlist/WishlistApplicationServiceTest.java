package taedonghee.plan_fix.application.wishlist;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.application.board.BoardApplicationService;
import taedonghee.plan_fix.application.course.CourseApplicationService;
import taedonghee.plan_fix.application.spot.SpotThumbnailResolver;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;
import taedonghee.plan_fix.interfaces.api.wishlist.WishlistSpotResponse;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class WishlistApplicationServiceTest {

    @Test
    void liked_spots_preserve_representatives_and_batch_detail_fallbacks_without_saving() {
        SpotRepository spots = mock(SpotRepository.class);
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        SpotModel representative = spot(1L, "https://images.example.com/representative.jpg");
        SpotModel detailOnly = spot(2L, null);
        SpotModel noImage = spot(3L, null);
        when(spots.findLikedByUserId(10L)).thenReturn(List.of(representative, detailOnly, noImage));
        when(images.findBySpotIds(Set.of(2L, 3L))).thenReturn(List.of(
                new SpotImageCandidate(2L, "https://images.example.com/detail.jpg", null)));
        WishlistApplicationService service = new WishlistApplicationService(spots,
                mock(CourseApplicationService.class), mock(BoardApplicationService.class),
                new SpotThumbnailResolver(images));

        List<WishlistSpotResponse> results = service.listLikedSpots(10L).stream()
                .map(WishlistSpotResponse::from).toList();

        assertThat(results).extracting(WishlistSpotResponse::thumbnail).containsExactly(
                representative.thumbnail(), "https://images.example.com/detail.jpg", null);
        assertThat(results).extracting(WishlistSpotResponse::spotId).containsExactly(1L, 2L, 3L);
        assertThat(results).allSatisfy(result -> {
            assertThat(result.isLiked()).isTrue();
            assertThat(result.likeCount()).isEqualTo(5L);
        });
        assertThat(detailOnly.thumbnail()).isNull();
        assertThat(noImage.thumbnail()).isNull();
        verify(images, times(1)).findBySpotIds(Set.of(2L, 3L));
        verifyNoMoreInteractions(images);
        verify(spots, never()).save(any());
    }

    private static SpotModel spot(long id, String thumbnail) {
        return SpotModel.builder().spotId(id).sourceType(SpotSourceType.TOUR_API)
                .title("장소 " + id).category("관광지").thumbnail(thumbnail).likeCount(5L).build();
    }
}
