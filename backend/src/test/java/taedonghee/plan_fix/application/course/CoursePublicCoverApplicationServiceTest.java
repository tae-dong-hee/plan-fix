package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseRepository;
import taedonghee.plan_fix.domain.course.CourseSortType;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static taedonghee.plan_fix.application.course.CourseCoverImageSelectorTest.course;
import static taedonghee.plan_fix.application.course.CourseCoverImageSelectorTest.spot;

class CoursePublicCoverApplicationServiceTest {

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

    private static CourseApplicationService service(CourseRepository courses, SpotRepository spots) {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                new CourseCoverImageSelector.Image("coast", "https://images.example.com/coast.jpg", List.of("150"), List.of("coast"), List.of("바다")),
                new CourseCoverImageSelector.Image("lake", "https://images.example.com/lake.jpg", List.of("110"), List.of("lake"), List.of("호수"))));
        return new CourseApplicationService(courses, spots, null, null, selector);
    }
}
