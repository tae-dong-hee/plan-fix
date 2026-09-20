package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static taedonghee.plan_fix.application.course.CourseCoverImageSelectorTest.course;

class CourseSpotCoverImageTest {

    private final CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
            new CourseCoverImageSelector.Image("fallback", "https://images.example.com/fallback.jpg",
                    List.of(), List.of(), List.of())));

    @Test
    void preserves_uploaded_cover_even_when_course_spot_photos_are_available() {
        CourseModel course = course(1, "여행", null, url("upload"), 11L);

        assertThat(selector.select(course, Map.of(11L, spot(11, url("spot"))), Map.of(11L, url("detail"))))
                .isEqualTo(url("upload"));
    }

    @Test
    void uses_actual_course_spot_photo_before_fallback_and_ignores_other_courses_spots() {
        CourseModel course = course(1, "여행", null, null, 11L, 12L);
        Map<Long, SpotModel> spots = Map.of(
                11L, spot(11, "  "), 12L, spot(12, url("spot")), 13L, spot(13, url("unrelated")));

        assertThat(selector.select(course, spots)).isEqualTo(url("spot"));
        assertThat(selector.selectForCourses(List.of(course), spots))
                .containsEntry(1L, url("spot"));
        assertThat(course.thumbnail()).isNull();
    }

    @Test
    void uses_resolved_detail_photo_before_fallback_without_changing_saved_spot() {
        SpotModel spot = spot(11, null);
        CourseModel course = course(1, "여행", null, null, 11L);
        Map<Long, String> resolved = Map.of(11L, url("detail"), 99L, url("unrelated"));

        assertThat(selector.select(course, Map.of(11L, spot), resolved)).isEqualTo(url("detail"));
        assertThat(selector.selectForCourses(List.of(course), Map.of(11L, spot), resolved))
                .containsEntry(1L, url("detail"));
        assertThat(spot.thumbnail()).isNull();
        assertThat(course.thumbnail()).isNull();
    }

    @Test
    void reassigns_shared_spot_photos_to_maximize_distinct_course_covers() {
        List<CourseModel> courses = List.of(
                course(1, "첫 여행", null, null, 11L, 12L),
                course(2, "둘째 여행", null, null, 12L, 13L),
                course(3, "셋째 여행", null, null, 11L, 12L));
        Map<Long, String> resolved = Map.of(11L, url("a"), 12L, url("b"), 13L, url("c"));

        Map<Long, String> allocated = selector.selectForCourses(courses, Map.of(), resolved);

        assertThat(allocated.values()).containsExactlyInAnyOrder(url("a"), url("b"), url("c"));
        assertThat(allocated).containsEntry(2L, url("c"));
        assertThat(selector.selectForCourses(courses.reversed(), Map.of(), resolved)).isEqualTo(allocated);
    }

    @Test
    void reserves_uploaded_photos_and_uses_another_course_spot_photo_when_possible() {
        CourseModel uploaded = course(10, "내 사진", null, url("shared"), 99L);
        CourseModel automatic = course(1, "여행", null, null, 11L, 12L);

        Map<Long, String> allocated = selector.selectForCourses(List.of(automatic, uploaded), Map.of(),
                Map.of(11L, url("shared"), 12L, url("alternative")));

        assertThat(allocated).containsEntry(10L, url("shared")).containsEntry(1L, url("alternative"));
    }

    @Test
    void keeps_course_photo_even_when_it_must_repeat_instead_of_switching_to_catalog() {
        List<CourseModel> courses = List.of(
                course(1, "첫 여행", null, null, 11L),
                course(2, "둘째 여행", null, null, 11L),
                course(3, "사진 없는 여행", null, null, 12L));

        Map<Long, String> allocated = selector.selectForCourses(courses, Map.of(), Map.of(11L, url("shared")));

        assertThat(allocated).containsEntry(1L, url("shared")).containsEntry(2L, url("shared"))
                .containsEntry(3L, url("fallback"));
    }

    @Test
    void treats_fragment_and_query_order_variants_as_the_same_reserved_upload() {
        String upload = url("shared") + "?width=600&quality=80#upload";
        CourseModel uploaded = course(10, "내 사진", null, upload, 99L);
        CourseModel automatic = course(1, "여행", null, null, 11L, 12L);

        Map<Long, String> allocated = selector.selectForCourses(List.of(automatic, uploaded), Map.of(),
                Map.of(11L, url("shared") + "?quality=80&width=600#spot", 12L, url("alternative")));

        assertThat(allocated).containsEntry(10L, upload).containsEntry(1L, url("alternative"));
    }

    @Test
    void maximizes_distinct_photos_even_when_courses_use_different_url_fragments() {
        CourseModel flexible = course(1, "첫 여행", null, null, 11L, 12L);
        CourseModel scarce = course(2, "둘째 여행", null, null, 13L);

        Map<Long, String> allocated = selector.selectForCourses(List.of(flexible, scarce), Map.of(),
                Map.of(11L, url("shared") + "#first", 12L, url("alternative"), 13L, url("shared") + "#second"));

        assertThat(allocated).containsEntry(1L, url("alternative")).containsEntry(2L, url("shared") + "#second");
    }

    private static SpotModel spot(long id, String thumbnail) {
        return SpotModel.builder().spotId(id).sourceType(SpotSourceType.TOUR_API)
                .title("여행 장소").category("관광지").thumbnail(thumbnail).build();
    }

    private static String url(String name) {
        return "https://images.example.com/" + name + ".jpg";
    }
}
