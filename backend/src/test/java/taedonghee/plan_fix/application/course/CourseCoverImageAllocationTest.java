package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.spot.SpotModel;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static taedonghee.plan_fix.application.course.CourseCoverImageSelectorTest.course;
import static taedonghee.plan_fix.application.course.CourseCoverImageSelectorTest.spot;

class CourseCoverImageAllocationTest {

    @Test
    void uses_a_relevant_lower_ranked_image_instead_of_repeating_the_best_match() {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                image("coffee-dessert", List.of("110"), "cafe", "커피", "디저트"),
                image("coffee", List.of("110"), "cafe", "커피")));
        CourseModel first = course(1, "커피와 디저트 여행", null, null, 11L);
        CourseModel second = course(2, "커피와 디저트 여행", null, null, 11L);
        Map<Long, SpotModel> spots = Map.of(11L, spot(11, "51", "110", "커피 카페", "카페/음료", null));

        assertThat(selector.select(first, spots)).isEqualTo(url("coffee-dessert"));
        assertThat(selector.select(second, spots)).isEqualTo(url("coffee-dessert"));

        assertThat(selector.selectForCourses(List.of(first, second), spots).values())
                .containsExactlyInAnyOrder(url("coffee-dessert"), url("coffee"));
    }

    @Test
    void leaves_the_only_eligible_image_for_the_course_that_has_no_alternative() {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                image("shared-lake", List.of("110", "130"), "lake", "호수", "산책"),
                image("chuncheon-lake", List.of("110"), "lake", "호수")));
        CourseModel flexible = course(1, "호수 산책", null, null, 11L);
        CourseModel scarce = course(2, "호수 산책", null, null, 12L);
        Map<Long, SpotModel> spots = Map.of(
                11L, spot(11, "51", "110", "호수", "관광지", null),
                12L, spot(12, "51", "130", "호수", "관광지", null));

        Map<Long, String> allocated = selector.selectForCourses(List.of(flexible, scarce), spots);

        assertThat(allocated).containsEntry(flexible.courseId(), url("chuncheon-lake"))
                .containsEntry(scarce.courseId(), url("shared-lake"));
    }

    @Test
    void reassigns_an_earlier_course_when_equal_sized_candidate_pools_would_otherwise_repeat() {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                image("lake-a", List.of("110", "190"), "lake", "소양호"),
                image("lake-b", List.of("110", "130", "190"), "lake", "청초호"),
                image("lake-c", List.of("130"), "lake", "호수")));
        CourseModel first = course(1, "소양호 호수 여행", null, null, 11L);
        CourseModel second = course(2, "청초호 호수 여행", null, null, 12L);
        CourseModel third = course(3, "호수 여행", null, null, 13L);
        Map<Long, SpotModel> spots = Map.of(
                11L, spot(11, "51", "110", "호수", "관광지", null),
                12L, spot(12, "51", "130", "호수", "관광지", null),
                13L, spot(13, "51", "190", "호수", "관광지", null));
        // 후보는 각각 {a,b}, {b,c}, {a,b}: 모든 코스의 후보 수가 같아 선착순만으로는 부족하다.
        assertThat(selector.select(first, spots)).isEqualTo(url("lake-a"));
        assertThat(selector.select(second, spots)).isEqualTo(url("lake-b"));

        Map<Long, String> allocated = selector.selectForCourses(List.of(first, second, third), spots);

        assertThat(allocated.values()).containsExactlyInAnyOrder(url("lake-a"), url("lake-b"), url("lake-c"));
        assertThat(allocated).containsEntry(second.courseId(), url("lake-c"));
    }

    @Test
    void keeps_course_assignments_when_input_and_catalog_order_are_reversed() {
        List<CourseCoverImageSelector.Image> images = List.of(
                image("lake-a", List.of("110"), "lake", "호수"),
                image("lake-b", List.of("110"), "lake", "호수"),
                image("lake-c", List.of("110"), "lake", "호수"));
        List<CourseModel> courses = LongStream.rangeClosed(1, 5)
                .mapToObj(id -> course(id, "호수 여행", null, null, 11L)).toList();
        Map<Long, SpotModel> spots = Map.of(11L, spot(11, "51", "110", "호수", "관광지", null));
        List<CourseModel> reversedCourses = new ArrayList<>(courses);
        Collections.reverse(reversedCourses);
        List<CourseCoverImageSelector.Image> reversedImages = new ArrayList<>(images);
        Collections.reverse(reversedImages);
        CourseCoverImageSelector selector = new CourseCoverImageSelector(images);

        Map<Long, String> expected = selector.selectForCourses(courses, spots);

        assertThat(selector.selectForCourses(courses, spots)).isEqualTo(expected);
        assertThat(selector.selectForCourses(reversedCourses, spots)).isEqualTo(expected);
        assertThat(new CourseCoverImageSelector(reversedImages).selectForCourses(reversedCourses, spots))
                .isEqualTo(expected);
    }

    @Test
    void preserves_explicit_images_and_reserves_catalog_images_before_allocating_defaults() {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                image("chosen-lake", List.of("110"), "lake", "호수", "산책"),
                image("other-lake", List.of("110"), "lake", "호수")));
        CourseModel automatic = course(1, "호수 산책", null, null, 11L);
        CourseModel explicitCatalog = course(10, "직접 고른 기본 사진", null, url("chosen-lake"), 99L);
        String uploadedUrl = "https://user.example.com/trip.jpg";
        CourseModel uploadedFirst = course(11, "직접 올린 사진", null, uploadedUrl, 99L);
        CourseModel uploadedSecond = course(12, "같은 사진을 직접 선택", null, uploadedUrl, 99L);

        Map<Long, String> allocated = selector.selectForCourses(
                List.of(automatic, explicitCatalog, uploadedFirst, uploadedSecond),
                Map.of(11L, spot(11, "51", "110", "호수", "관광지", null)));

        assertThat(allocated).hasSize(4)
                .containsEntry(automatic.courseId(), url("other-lake"))
                .containsEntry(explicitCatalog.courseId(), url("chosen-lake"))
                .containsEntry(uploadedFirst.courseId(), uploadedUrl)
                .containsEntry(uploadedSecond.courseId(), uploadedUrl);
        assertThat(automatic.thumbnail()).isNull();
        assertThat(explicitCatalog.thumbnail()).isEqualTo(url("chosen-lake"));
    }

    @Test
    void shares_repeated_images_evenly_when_all_relevant_images_are_exhausted() {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                image("lake-a", List.of("110"), "lake", "호수"),
                image("lake-b", List.of("110"), "lake", "호수"),
                image("lake-c", List.of("110"), "lake", "호수")));
        List<CourseModel> courses = LongStream.rangeClosed(1, 8)
                .mapToObj(id -> course(id, "호수 여행", null, null, 11L)).toList();

        Map<Long, String> allocated = selector.selectForCourses(courses,
                Map.of(11L, spot(11, "51", "110", "호수", "관광지", null)));
        Map<String, Long> usage = allocated.values().stream()
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));

        assertThat(allocated).hasSize(8);
        assertThat(usage).containsOnlyKeys(url("lake-a"), url("lake-b"), url("lake-c"));
        assertThat(usage.values()).containsExactlyInAnyOrder(2L, 3L, 3L);
    }

    @Test
    void allows_repetition_instead_of_using_an_unrelated_region_or_generic_theme() {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(List.of(
                image("local-lake", List.of("110"), "lake", "호수"),
                image("other-region-lake", List.of("150"), "lake", "호수"),
                image("generic-bedroom", List.of(), "accommodation", "숙소")));
        List<CourseModel> courses = List.of(
                course(1, "춘천 호수 여행", null, null, 11L),
                course(2, "춘천 호수 여행", null, null, 11L));

        Map<Long, String> allocated = selector.selectForCourses(courses,
                Map.of(11L, spot(11, "51", "110", "호수", "관광지", null)));

        assertThat(allocated.values()).containsExactlyInAnyOrder(url("local-lake"), url("local-lake"));
    }

    private static CourseCoverImageSelector.Image image(String id, List<String> regions,
                                                        String theme, String... keywords) {
        return new CourseCoverImageSelector.Image(id, url(id), regions, List.of(theme), List.of(keywords));
    }

    private static String url(String id) {
        return "https://images.example.com/" + id + ".jpg";
    }
}
