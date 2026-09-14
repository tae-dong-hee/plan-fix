package taedonghee.plan_fix.application.course;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.LongStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CourseCoverImageSelectorTest {

    @Test
    void preserves_explicit_thumbnail_without_replacing_it_with_catalog_image() {
        CourseCoverImageSelector selector = selector(image("coast", "150", "coast"));
        CourseModel course = course(1, "바다 여행", null, "https://user.example.com/my-photo.jpg", 11L);

        assertThat(selector.select(course, Map.of())).isEqualTo(course.thumbnail());
    }

    @Test
    void prefers_an_actual_course_spots_region_over_another_regions_matching_theme() {
        CourseCoverImageSelector selector = selector(image("local", "110", "lake"), image("coast", "150", "coast"));
        CourseModel course = course(1, "바다 여행", null, null, 11L);

        assertThat(selector.select(course, Map.of(11L, spot(11, "51", "110", "여행 장소", "관광지", null))))
                .isEqualTo(url("local"));
    }

    @Test
    void narrows_region_candidates_using_spot_category() {
        CourseCoverImageSelector selector = selector(image("lake", "110", "lake"), image("cafe", "110", "cafe"));

        assertThat(selector.select(course(1, "주말 여행", null, null, 11L),
                Map.of(11L, spot(11, "51", "110", "여행 장소", "카페/음료", null))))
                .isEqualTo(url("cafe"));
    }

    @Test
    void recognizes_theme_from_course_title_description_and_spot_title_description() {
        CourseCoverImageSelector selector = selector(image("lake", "110", "lake"), image("cafe", "110", "cafe"));
        List<CourseModel> courses = List.of(
                course(1, "커피 여행", null, null, 11L),
                course(1, "주말 여행", "디저트를 먹고 쉬어요", null, 11L),
                course(1, "주말 여행", null, null, 12L),
                course(1, "주말 여행", null, null, 13L));
        Map<Long, SpotModel> spots = Map.of(
                11L, spot(11, "51", "110", "장소", "관광지", null),
                12L, spot(12, "51", "110", "호숫가 카페", "관광지", null),
                13L, spot(13, "51", "110", "장소", "관광지", "찻집에서 쉬어 갈 수 있어요"));

        // 테마 신호가 있는 해당 코스의 장소만 읽으며, 다른 코스의 장소는 섞이지 않는다.
        for (CourseModel course : courses) {
            assertThat(selector.select(course, spots)).isEqualTo(url("cafe"));
        }
    }

    @Test
    void uses_image_keywords_even_when_its_theme_has_no_builtin_dictionary() {
        CourseCoverImageSelector selector = selector(image("forest", "760", "forest"),
                new CourseCoverImageSelector.Image("flowers", url("flowers"), List.of("760"), List.of("flower"), List.of("메밀꽃")));

        assertThat(selector.select(course(1, "봉평 메밀꽃 여행", null, null, 11L),
                Map.of(11L, spot(11, "51", "760", "봉평", "관광지", null))))
                .isEqualTo(url("flowers"));
    }

    @Test
    void pyeongchang_sheep_ranch_course_prefers_sheep_photos_over_same_regions_mountain() {
        CourseCoverImageSelector selector = pyeongchangSelector();
        Map<Long, SpotModel> spots = Map.of(11L, spot(11, "51", "760", "대관령 양떼목장", "관광지", "평창에서 목장을 둘러봐요"));

        for (long id = 1; id <= 30; id++) {
            assertThat(selector.select(course(id, "평창 여행", null, null, 11L), spots))
                    .isIn(url("sheep-one"), url("sheep-two"));
        }
    }

    @Test
    void only_pyeongchang_name_keeps_all_regional_candidates_and_does_not_score_general_theme() {
        CourseCoverImageSelector selector = pyeongchangSelector();
        Map<Long, SpotModel> spots = Map.of(11L, spot(11, "51", "760", "여행 장소", "관광지", null));
        List<String> selected = new ArrayList<>();

        for (long id = 1; id <= 40; id++) {
            String plain = selector.select(course(id, "주말 여행", null, null, 11L), spots);
            assertThat(selector.select(course(id, "강원특별자치도 평창군 여행", "평창", null, 11L), spots)).isEqualTo(plain);
            assertThat(selector.select(course(id, "general", null, null, 11L), spots)).isEqualTo(plain);
            selected.add(plain);
        }
        assertThat(selected).contains(url("sheep-one"), url("sheep-two"), url("winter-mountain"));
    }

    @Test
    void surfing_keyword_beats_generic_beach_words_and_does_not_count_nested_place_names_twice() {
        CourseCoverImageSelector selector = selector(
                new CourseCoverImageSelector.Image("beach", url("beach"), List.of("150"), List.of("coast"), List.of("강릉", "경포", "경포해변", "해변", "모래", "바다")),
                new CourseCoverImageSelector.Image("surfing", url("surfing"), List.of("150"), List.of("coast"), List.of("강릉", "경포", "경포해변", "서핑", "바다")));
        Map<Long, SpotModel> spots = Map.of(11L, spot(11, "51", "150", "경포해변", "관광지", "바다와 모래 해변"));

        for (long id = 1; id <= 20; id++) {
            assertThat(selector.select(course(id, "강릉 서핑 여행", null, null, 11L), spots)).isEqualTo(url("surfing"));
        }
    }

    @Test
    void forest_theme_distinguishes_photos_with_the_same_region_name_keyword() {
        CourseCoverImageSelector selector = selector(
                new CourseCoverImageSelector.Image("beach", url("beach"), List.of("150"), List.of("coast"), List.of("강릉", "해변", "바다")),
                new CourseCoverImageSelector.Image("forest", url("forest"), List.of("150"), List.of("forest", "coast"), List.of("강릉", "소나무", "숲", "바다")));
        Map<Long, SpotModel> spots = Map.of(11L, spot(11, "51", "150", "여행 장소", "관광지", "강릉에서 숲을 걸어요"));

        assertThat(selector.select(course(1, "강릉 여행", null, null, 11L), spots)).isEqualTo(url("forest"));
    }

    private static CourseCoverImageSelector pyeongchangSelector() {
        return selector(
                new CourseCoverImageSelector.Image("sheep-one", url("sheep-one"), List.of("760"), List.of("general", "mountain"), List.of("평창", "대관령", "양떼목장", "목장", "초원", "양")),
                new CourseCoverImageSelector.Image("sheep-two", url("sheep-two"), List.of("760"), List.of("general", "mountain"), List.of("평창", "대관령", "양떼목장", "목장", "초원", "양")),
                new CourseCoverImageSelector.Image("winter-mountain", url("winter-mountain"), List.of("760"), List.of("mountain", "forest"), List.of("평창", "오대산", "월정사", "겨울", "눈", "등산", "산")),
                image("another-region", "150", "coast"));
    }

    @Test
    void uses_theme_across_catalog_when_course_region_has_no_catalog_image() {
        CourseCoverImageSelector selector = selector(image("lake", "110", "lake"), image("coast", "150", "coast"));

        assertThat(selector.select(course(1, "바다 여행", null, null, 11L),
                Map.of(11L, spot(11, "51", "730", "장소", "관광지", null))))
                .isEqualTo(url("coast"));
    }

    @Test
    void does_not_treat_another_provinces_same_district_code_as_gangwon() {
        CourseCoverImageSelector selector = selector(image("lake", "110", "lake"), image("cafe", "150", "cafe"));

        assertThat(selector.select(course(1, "카페 여행", null, null, 11L),
                Map.of(11L, spot(11, "11", "110", "장소", "관광지", null))))
                .isEqualTo(url("cafe"));
    }

    @Test
    void does_not_use_spots_belonging_to_other_courses_in_the_batched_map() {
        CourseCoverImageSelector selector = selector(image("cafe", "110", "cafe"), image("coast", "150", "coast"));
        Map<Long, SpotModel> spots = Map.of(
                11L, spot(11, null, null, "찻집", "카페/음료", null),
                12L, spot(12, "51", "150", "해변", "관광지", null));

        assertThat(selector.select(course(1, "주말 여행", null, null, 11L), spots)).isEqualTo(url("cafe"));
    }

    @Test
    void falls_back_to_entire_catalog_without_spot_metadata_and_stays_stable_across_catalog_order() {
        CourseCoverImageSelector.Image first = image("first", "110", "lake");
        CourseCoverImageSelector.Image second = image("second", "150", "coast");
        CourseCoverImageSelector selector = selector(first, second);
        CourseCoverImageSelector reversed = selector(second, first);
        CourseModel course = course(31, "주말 여행", null, null, 11L);

        String selected = selector.select(course, Map.of());
        assertThat(selected).isIn(first.url(), second.url());
        assertThat(selector.select(course, Map.of())).isEqualTo(selected);
        assertThat(reversed.select(course, Map.of())).isEqualTo(selected);
        assertThat(course.thumbnail()).isNull();
    }

    @Test
    void different_course_ids_can_pick_different_relevant_candidates() {
        CourseCoverImageSelector selector = selector(image("first", "110", "lake"), image("second", "150", "coast"));

        assertThat(LongStream.rangeClosed(1, 30)
                .mapToObj(id -> selector.select(course(id, "주말 여행", null, null, 11L), Map.of()))
                .distinct().toList()).hasSize(2);
    }

    @Test
    void loads_forty_images_and_ignores_attribution_metadata() throws Exception {
        List<Map<String, Object>> images = new ArrayList<>();
        for (int i = 0; i < 40; i++) {
            images.add(Map.of("id", "photo-" + i, "url", url("photo-" + i), "regions", List.of("150"),
                    "themes", List.of("coast"), "keywords", List.of("바다"), "author", "Photographer",
                    "license", "CC BY", "sourceUrl", "https://source.example.com/photo-" + i));
        }
        ObjectMapper mapper = new ObjectMapper();
        byte[] json = mapper.writeValueAsBytes(Map.of("version", 1, "images", images, "notes", "attribution metadata"));
        CourseCoverImageSelector selector = new CourseCoverImageSelector(mapper, new ByteArrayResource(json));

        assertThat(selector.select(course(1, "바다 여행", null, null, 11L), Map.of()))
                .startsWith("https://images.example.com/photo-");
    }

    @Test
    void missing_or_malformed_required_catalog_fails_with_a_clear_message() {
        assertThatThrownBy(() -> new CourseCoverImageSelector(new ObjectMapper(), new ClassPathResource("absent-course-covers.json")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("course-cover-images.json");
        assertThatThrownBy(() -> new CourseCoverImageSelector(new ObjectMapper(), new ByteArrayResource("not-json".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("course-cover-images.json");
        assertThatThrownBy(() -> new CourseCoverImageSelector(new ObjectMapper(),
                new ByteArrayResource("{\"version\":1,\"images\":[]}".getBytes(StandardCharsets.UTF_8))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("1 to 40 images");
    }

    @Test
    void generic_accommodation_and_winter_photos_can_match_courses_with_regional_spots() {
        CourseCoverImageSelector selector = selector(image("local-lake", "110", "lake"),
                new CourseCoverImageSelector.Image("bedroom", url("bedroom"), List.of(), List.of("accommodation"), List.of()),
                new CourseCoverImageSelector.Image("snow", url("snow"), List.of(), List.of("winter"), List.of()));
        Map<Long, SpotModel> spots = Map.of(11L, spot(11, "51", "110", "장소", "관광지", null));

        assertThat(selector.select(course(1, "호캉스 여행", null, null, 11L), spots)).isEqualTo(url("bedroom"));
        assertThat(selector.select(course(1, "눈꽃 여행", null, null, 11L), spots)).isEqualTo(url("snow"));
        assertThat(selector.select(course(1, "주말 여행", null, null, 11L),
                Map.of(11L, spot(11, "51", "110", "장소", "숙박", null)))).isEqualTo(url("bedroom"));
    }

    @Test
    void unrelated_generic_photos_do_not_replace_regional_defaults() {
        CourseCoverImageSelector selector = selector(image("local-lake", "110", "lake"),
                new CourseCoverImageSelector.Image("bedroom", url("bedroom"), List.of(), List.of("accommodation"), List.of()));
        for (long id = 1; id <= 30; id++) {
            assertThat(selector.select(course(id, "주말 여행", null, null, 11L),
                    Map.of(11L, spot(11, "51", "110", "장소", "관광지", null)))).isEqualTo(url("local-lake"));
        }
    }

    @Test
    void real_catalog_selects_reviewed_accommodation_and_activity_photos_by_content() {
        CourseCoverImageSelector selector = new CourseCoverImageSelector(new ObjectMapper());
        Map<Long, SpotModel> spots = Map.of(11L, spot(11, "51", "110", "장소", "관광지", null));

        assertThat(selector.select(course(1, "호캉스 숙소 여행", null, null, 11L), spots))
                .endsWith("/2026-09-v2/gangwon-course-cover-22.jpg");
        assertThat(selector.select(course(1, "급류 래프팅", null, null, 11L), spots))
                .endsWith("/2026-09-v2/gangwon-course-cover-33.jpg");
        assertThat(selector.select(course(1, "카누 체험", null, null, 11L), spots))
                .endsWith("/2026-09-v2/gangwon-course-cover-34.jpg");
    }

    @Test
    void rejects_duplicate_ids_and_non_https_image_urls() {
        CourseCoverImageSelector.Image image = image("photo", "150", "coast");
        assertThatThrownBy(() -> selector(image, image)).isInstanceOf(IllegalArgumentException.class).hasMessageContaining("unique");
        assertThatThrownBy(() -> selector(new CourseCoverImageSelector.Image("photo", "http://images.example.com/photo.jpg", List.of(), List.of(), List.of())))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("HTTPS");
    }

    private static CourseCoverImageSelector selector(CourseCoverImageSelector.Image... images) {
        return new CourseCoverImageSelector(List.of(images));
    }

    private static CourseCoverImageSelector.Image image(String id, String region, String theme) {
        return new CourseCoverImageSelector.Image(id, url(id), List.of(region), List.of(theme), List.of());
    }

    private static String url(String id) {
        return "https://images.example.com/" + id + ".jpg";
    }

    static CourseModel course(long id, String title, String description, String thumbnail, Long... spotIds) {
        return CourseModel.reconstruct(id, 10L, title, description, thumbnail, CourseVisibility.PUBLIC,
                CourseStatus.ACTIVE, 3, 2, null, null,
                List.of(new CourseDayModel(1, java.util.Arrays.stream(spotIds).map(spotId -> new CourseSpotModel(spotId, null)).toList())),
                OffsetDateTime.parse("2026-09-12T00:00:00Z"), OffsetDateTime.parse("2026-09-12T00:00:00Z"));
    }

    static SpotModel spot(long id, String region, String sigungu, String title, String category, String description) {
        return SpotModel.builder().spotId(id).sourceType(SpotSourceType.TOUR_API).region(region).sigungu(sigungu)
                .title(title).category(category).description(description).build();
    }
}
