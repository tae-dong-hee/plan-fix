package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.application.spot.SpotThumbnailResolver;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseRepository;
import taedonghee.plan_fix.domain.course.CourseSortType;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static taedonghee.plan_fix.application.course.CourseCoverImageSelectorTest.course;
import static taedonghee.plan_fix.application.course.CourseCoverImageSelectorTest.spot;

class CoursePublicCoverApplicationServiceTest {

    @Test
    void random_public_list_fetches_a_new_selection_and_preserves_its_order_and_covers() {
        CourseRepository courses = mock(CourseRepository.class);
        SpotRepository spots = mock(SpotRepository.class);
        CourseModel older = course(1, "오래된 공개 코스", null, "https://user.example.com/older.jpg", 11L);
        CourseModel newer = course(30, "최근 공개 코스", null, "https://user.example.com/newer.jpg", 12L);
        when(courses.searchPublic(CourseSortType.RANDOM, 0, 20))
                .thenReturn(List.of(older, newer))
                .thenReturn(List.of(newer, older));
        when(courses.countPublic()).thenReturn(30L);
        CourseApplicationService service = service(courses, spots);

        CourseListResult first = service.listPublic(new CourseListQuery("random", 0, 20));
        CourseListResult next = service.listPublic(new CourseListQuery("random", 0, 20));

        assertThat(first.items()).extracting(CourseListResult.Item::courseId).containsExactly(1L, 30L);
        assertThat(next.items()).extracting(CourseListResult.Item::courseId).containsExactly(30L, 1L);
        assertThat(first.items()).extracting(CourseListResult.Item::thumbnail)
                .containsExactly(older.thumbnail(), newer.thumbnail());
        assertThat(first.totalCount()).isEqualTo(30);
        assertThat(first.offset()).isZero();
        assertThat(first.size()).isEqualTo(20);
        verify(courses, times(2)).searchPublic(CourseSortType.RANDOM, 0, 20);
        verifyNoInteractions(spots);
        verify(courses, never()).save(any());
    }

    @Test
    void public_list_batches_only_missing_thumbnails_spots_and_preserves_explicit_covers() {
        CourseRepository courses = mock(CourseRepository.class);
        SpotRepository spots = mock(SpotRepository.class);
        CourseModel gangneung = course(1, "바다 여행", null, null, 11L, 13L);
        CourseModel chuncheon = course(2, "주말 여행", null, null, 12L, 13L);
        CourseModel custom = course(3, "직접 올린 코스", null, "https://user.example.com/custom.jpg", 99L);
        when(courses.searchPublic(CourseSortType.POPULAR, 0, 20)).thenReturn(List.of(gangneung, chuncheon, custom));
        when(courses.countPublic()).thenReturn(8L);
        when(spots.findAllByIdIn(Set.of(11L, 12L, 13L))).thenReturn(List.of(
                spot(11, "51", "150", "경포해변", "관광지", null),
                spot(12, "51", "110", "의암호", "관광지", null),
                spot(13, null, null, "공유 장소", "관광지", null)));
        CourseApplicationService service = service(courses, spots);

        CourseListResult result = service.listPublic(new CourseListQuery("popular", 0, 20));

        assertThat(result.totalCount()).isEqualTo(8);
        assertThat(result.items()).extracting(CourseListResult.Item::courseId).containsExactly(1L, 2L, 3L);
        assertThat(result.items().get(0).thumbnail()).isEqualTo("https://images.example.com/coast.jpg");
        assertThat(result.items().get(1).thumbnail()).isEqualTo("https://images.example.com/lake.jpg");
        assertThat(result.items().get(2).thumbnail()).isEqualTo(custom.thumbnail());
        assertThat(result.items().get(0).dayCount()).isEqualTo(1);
        assertThat(result.items().get(0).spotCount()).isEqualTo(2);
        assertThat(gangneung.thumbnail()).isNull();
        assertThat(chuncheon.thumbnail()).isNull();
        verify(spots, times(1)).findAllByIdIn(Set.of(11L, 12L, 13L));
        verifyNoMoreInteractions(spots);
        verify(courses, never()).save(any());
    }

    @Test
    void explicit_covers_and_empty_pages_do_not_trigger_spot_lookup() {
        CourseRepository courses = mock(CourseRepository.class);
        SpotRepository spots = mock(SpotRepository.class);
        CourseModel custom = course(3, "직접 올린 코스", null, "https://user.example.com/custom.jpg", 99L);
        when(courses.searchPublic(CourseSortType.LATEST, 0, 20)).thenReturn(List.of(custom));
        when(courses.searchPublic(CourseSortType.LATEST, 20, 20)).thenReturn(List.of());
        when(courses.countPublic()).thenReturn(1L);
        CourseApplicationService service = service(courses, spots);

        assertThat(service.listPublic(new CourseListQuery("latest", 0, 20)).items().get(0).thumbnail()).isEqualTo(custom.thumbnail());
        assertThat(service.listPublic(new CourseListQuery("latest", 20, 20)).items()).isEmpty();
        verifyNoInteractions(spots);
        verify(courses, never()).save(any());
    }

    @Test
    void detail_response_keeps_raw_thumbnail_after_public_card_receives_catalog_cover() {
        CourseRepository courses = mock(CourseRepository.class);
        SpotRepository spots = mock(SpotRepository.class);
        CourseModel course = course(1, "바다 여행", null, null, 11L);
        SpotModel beach = spot(11, "51", "150", "경포해변", "관광지", null);
        when(courses.searchPublic(CourseSortType.LATEST, 0, 20)).thenReturn(List.of(course));
        when(courses.countPublic()).thenReturn(1L);
        when(courses.findById(1L)).thenReturn(Optional.of(course));
        when(spots.findAllByIdIn(Set.of(11L))).thenReturn(List.of(beach));
        CourseApplicationService service = service(courses, spots);

        assertThat(service.listPublic(new CourseListQuery("latest", 0, 20)).items().get(0).thumbnail())
                .isEqualTo("https://images.example.com/coast.jpg");
        assertThat(service.getCourse(null, 1L).thumbnail()).isNull();
        assertThat(course.thumbnail()).isNull();
        verify(courses, never()).save(any());
    }

    @Test
    void public_list_allocates_distinct_related_covers_without_changing_response_order() {
        CourseRepository courses = mock(CourseRepository.class);
        SpotRepository spots = mock(SpotRepository.class);
        CourseModel first = course(1, "해변 여행", null, null, 11L);
        CourseModel second = course(2, "해변 여행", null, null, 11L);
        when(courses.searchPublic(CourseSortType.LATEST, 0, 20)).thenReturn(List.of(second, first));
        when(courses.countPublic()).thenReturn(2L);
        when(spots.findAllByIdIn(Set.of(11L))).thenReturn(List.of(spot(11, "51", "150", "해변", "관광지", null)));
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                new CourseCoverImageSelector.Image("beach", "https://images.example.com/beach.jpg", List.of("150"), List.of("coast"), List.of("해변")),
                new CourseCoverImageSelector.Image("forest", "https://images.example.com/forest.jpg", List.of("150"), List.of("forest"), List.of("소나무"))));
        CourseApplicationService service = new CourseApplicationService(courses, spots, null, null, selector,
                new SpotThumbnailResolver(mock(TourDataImageRepository.class)));

        CourseListResult result = service.listPublic(new CourseListQuery("latest", 0, 20));

        assertThat(result.items()).extracting(CourseListResult.Item::courseId).containsExactly(2L, 1L);
        assertThat(result.items()).extracting(CourseListResult.Item::thumbnail).doesNotHaveDuplicates();
        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.offset()).isZero();
        assertThat(result.size()).isEqualTo(20);
        verify(spots).findAllByIdIn(Set.of(11L));
        verifyNoMoreInteractions(spots);
        verify(courses, never()).save(any());
    }

    @Test
    void public_list_uses_spot_representative_and_saved_detail_photos_before_catalog() {
        CourseRepository courses = mock(CourseRepository.class);
        SpotRepository spots = mock(SpotRepository.class);
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        CourseModel first = course(1, "장소 사진 코스", null, null, 11L);
        CourseModel second = course(2, "상세 사진 코스", null, null, 12L);
        CourseModel uploaded = course(3, "직접 올린 사진", null, "https://user.example.com/upload.jpg", 99L);
        SpotModel representative = SpotModel.builder().spotId(11L).sourceType(SpotSourceType.TOUR_API)
                .title("대표 사진 장소").category("관광지").thumbnail("https://images.example.com/spot.jpg").build();
        SpotModel detailOnly = spot(12, "51", "110", "상세 사진 장소", "관광지", null);
        when(courses.searchPublic(CourseSortType.POPULAR, 0, 20)).thenReturn(List.of(first, second, uploaded));
        when(courses.countPublic()).thenReturn(3L);
        when(spots.findAllByIdIn(Set.of(11L, 12L))).thenReturn(List.of(representative, detailOnly));
        when(images.findBySpotIds(Set.of(12L))).thenReturn(List.of(
                new SpotImageCandidate(12L, "https://images.example.com/detail.jpg", null)));
        CourseApplicationService service = new CourseApplicationService(courses, spots, null, null,
                new CourseCoverImageSelector(List.of(new CourseCoverImageSelector.Image("fallback",
                        "https://images.example.com/fallback.jpg", List.of(), List.of(), List.of()))),
                new SpotThumbnailResolver(images));

        CourseListResult result = service.listPublic(new CourseListQuery("popular", 0, 20));

        assertThat(result.items()).extracting(CourseListResult.Item::thumbnail).containsExactly(
                representative.thumbnail(), "https://images.example.com/detail.jpg", uploaded.thumbnail());
        assertThat(first.thumbnail()).isNull();
        assertThat(second.thumbnail()).isNull();
        assertThat(detailOnly.thumbnail()).isNull();
        verify(spots).findAllByIdIn(Set.of(11L, 12L));
        verify(images).findBySpotIds(Set.of(12L));
        verifyNoMoreInteractions(spots, images);
        verify(courses, never()).save(any());
    }

    private static CourseApplicationService service(CourseRepository courses, SpotRepository spots) {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                new CourseCoverImageSelector.Image("coast", "https://images.example.com/coast.jpg", List.of("150"), List.of("coast"), List.of("바다")),
                new CourseCoverImageSelector.Image("lake", "https://images.example.com/lake.jpg", List.of("110"), List.of("lake"), List.of("호수"))));
        return new CourseApplicationService(courses, spots, null, null, selector,
                new SpotThumbnailResolver(mock(TourDataImageRepository.class)));
    }
}
