package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.application.spot.SpotThumbnailResolver;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseRepository;
import taedonghee.plan_fix.domain.course.CourseSortType;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSearchCondition;
import taedonghee.plan_fix.domain.spot.SpotSortType;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;
import taedonghee.plan_fix.support.error.CoreException;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class CourseApplicationServiceTest {

    @Test
    @DisplayName("인증된 사용자의 코스를 Day 및 spot 순서, spot 요약 정보와 함께 생성한다")
    void create_saves_course_for_authenticated_user_with_ordered_spots() {
        Fixture fixture = new Fixture();
        SpotModel firstSpot = fixture.spots.save(spot("경포해변", "관광지", SpotStatus.ACTIVE));
        SpotModel secondSpot = fixture.spots.save(spot("안목커피거리", "음식점", SpotStatus.ACTIVE));

        LocalDate start = LocalDate.of(2026, 9, 12);
        LocalDate end = LocalDate.of(2026, 9, 12);

        CourseResult result = fixture.service().create(10L, new CourseCommand.Create(
                "Gangneung course", "one day", "thumb.jpg", CourseVisibility.PUBLIC,
                start, end,
                List.of(new CourseDayModel(1, List.of(
                        new CourseSpotModel(firstSpot.spotId(), "start"),
                        new CourseSpotModel(secondSpot.spotId(), "finish")
                )))
        ));

        assertThat(result.courseId()).isNotNull();
        assertThat(result.userId()).isEqualTo(10L);
        assertThat(result.visibility()).isEqualTo(CourseVisibility.PUBLIC);
        assertThat(result.startDate()).isEqualTo(start);
        assertThat(result.endDate()).isEqualTo(end);
        assertThat(result.days()).hasSize(1);

        CourseResult.Day day1 = result.days().get(0);
        assertThat(day1.dayNumber()).isEqualTo(1);
        assertThat(day1.spots()).hasSize(2);

        CourseResult.Spot spot1 = day1.spots().get(0);
        assertThat(spot1.spotId()).isEqualTo(firstSpot.spotId());
        assertThat(spot1.sequence()).isEqualTo(0);
        assertThat(spot1.memo()).isEqualTo("start");
        assertThat(spot1.title()).isEqualTo("경포해변");
        assertThat(spot1.category()).isEqualTo("관광지");

        CourseResult.Spot spot2 = day1.spots().get(1);
        assertThat(spot2.spotId()).isEqualTo(secondSpot.spotId());
        assertThat(spot2.sequence()).isEqualTo(1);
        assertThat(spot2.memo()).isEqualTo("finish");
        assertThat(spot2.title()).isEqualTo("안목커피거리");
        assertThat(spot2.category()).isEqualTo("음식점");
    }

    @Test
    @DisplayName("존재하지 않거나 HIDDEN 상태인 spot이 포함되어 있으면 예외가 발생한다")
    void create_rejects_missing_or_hidden_spot() {
        Fixture fixture = new Fixture();
        SpotModel hiddenSpot = fixture.spots.save(spot("숨김 스팟", "관광지", SpotStatus.HIDDEN));

        assertThatThrownBy(() -> fixture.service().create(10L, new CourseCommand.Create(
                "Hidden spot course", null, null, null, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(hiddenSpot.spotId(), null)))))))
                .isInstanceOf(CoreException.class)
                .hasMessageContaining("spot not found");

        assertThatThrownBy(() -> fixture.service().create(10L, new CourseCommand.Create(
                "Missing spot course", null, null, null, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(999L, null)))))))
                .isInstanceOf(CoreException.class)
                .hasMessageContaining("spot not found");
    }

    @Test
    @DisplayName("코스 수정 시 작성자 본인이 아니면 예외가 발생한다")
    void update_requires_course_owner() {
        Fixture fixture = new Fixture();
        SpotModel spot = fixture.spots.save(spot("스팟", "관광지", SpotStatus.ACTIVE));
        CourseResult created = fixture.service().create(10L, new CourseCommand.Create(
                "Before", null, null, null, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(spot.spotId(), null))))));

        assertThatThrownBy(() -> fixture.service().update(99L, created.courseId(), new CourseCommand.Update(
                "After", null, null, null, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(spot.spotId(), null)))))))
                .isInstanceOf(CoreException.class);
    }

    @Test
    @DisplayName("코스 삭제 시 DELETED 상태로 변경되고 목록에서 제외된다")
    void delete_soft_deletes_and_removes_from_my_list() {
        Fixture fixture = new Fixture();
        SpotModel spot = fixture.spots.save(spot("스팟", "관광지", SpotStatus.ACTIVE));
        CourseResult created = fixture.service().create(10L, new CourseCommand.Create(
                "Course", null, null, null, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(spot.spotId(), null))))));

        CourseResult deleted = fixture.service().delete(10L, created.courseId());

        assertThat(deleted.status()).isEqualTo(CourseStatus.DELETED);
        assertThat(fixture.service().listMine(10L)).isEmpty();
    }

    @Test
    @DisplayName("listMine 실행 시 여러 코스의 spotId를 모아 findAllByIdIn을 1회만 호출한다")
    void listMine_batches_spot_lookup() {
        Fixture fixture = new Fixture();
        SpotModel spot1 = fixture.spots.save(spot("스팟1", "관광지", SpotStatus.ACTIVE));
        SpotModel spot2 = fixture.spots.save(spot("스팟2", "음식점", SpotStatus.ACTIVE));

        fixture.service().create(10L, new CourseCommand.Create(
                "Course 1", null, null, null, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(spot1.spotId(), null))))));

        fixture.service().create(10L, new CourseCommand.Create(
                "Course 2", null, null, null, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(spot2.spotId(), null))))));

        int callsBefore = fixture.spots.findAllByIdInCallCount;
        List<CourseResult> myCourses = fixture.service().listMine(10L);

        assertThat(myCourses).hasSize(2);
        assertThat(fixture.spots.findAllByIdInCallCount - callsBefore).isEqualTo(1);
    }

    @Test
    void course_responses_use_saved_details_without_changing_spots_or_course_cover() {
        Fixture fixture = new Fixture();
        SpotModel missing = fixture.spots.save(SpotModel.builder().sourceType(SpotSourceType.TOUR_API)
                .title("상세사진 있는 장소").category("관광지").build());
        when(fixture.images.findBySpotIds(Set.of(missing.spotId()))).thenReturn(List.of(
                new SpotImageCandidate(missing.spotId(), "https://images.example.com/detail.jpg", null)));
        CourseApplicationService service = fixture.service();
        List<CourseDayModel> days = List.of(new CourseDayModel(1,
                List.of(new CourseSpotModel(missing.spotId(), "메모"))));

        CourseResult created = service.create(10L, new CourseCommand.Create(
                "Course", null, "https://images.example.com/course.jpg", CourseVisibility.PUBLIC,
                null, null, days));
        CourseResult updated = service.update(10L, created.courseId(), new CourseCommand.Update(
                "Updated", null, created.thumbnail(), CourseVisibility.PUBLIC, null, null, days));
        CourseResult detail = service.getCourse(null, created.courseId());
        for (CourseResult result : List.of(created, updated, detail)) {
            assertThat(result.days().getFirst().spots().getFirst().thumbnail())
                    .isEqualTo("https://images.example.com/detail.jpg");
            assertThat(result.thumbnail()).isEqualTo("https://images.example.com/course.jpg");
        }

        service.create(10L, new CourseCommand.Create("Second", null, null, null, null, null, days));
        clearInvocations(fixture.images);
        List<CourseResult> listed = service.listMine(10L);
        assertThat(listed).hasSize(2).allSatisfy(result ->
                assertThat(result.days().getFirst().spots().getFirst().thumbnail())
                        .isEqualTo("https://images.example.com/detail.jpg"));
        verify(fixture.images, times(1)).findBySpotIds(Set.of(missing.spotId()));
        verifyNoMoreInteractions(fixture.images);
        assertThat(missing.thumbnail()).isNull();
        assertThat(fixture.spots.findById(missing.spotId()).orElseThrow().thumbnail()).isNull();
    }

    @Test
    void liked_courses_resolve_shared_spot_photos_in_one_batch() {
        CourseRepository courses = mock(CourseRepository.class);
        SpotRepository spots = mock(SpotRepository.class);
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        SpotModel missing = SpotModel.builder().spotId(11L).sourceType(SpotSourceType.TOUR_API)
                .title("상세사진 있는 장소").category("관광지").build();
        when(courses.findLikedByUserId(10L)).thenReturn(List.of(
                CourseCoverImageSelectorTest.course(1, "첫 코스", null, null, 11L),
                CourseCoverImageSelectorTest.course(2, "다음 코스", null, null, 11L)));
        when(spots.findAllByIdIn(Set.of(11L))).thenReturn(List.of(missing));
        when(images.findBySpotIds(Set.of(11L))).thenReturn(List.of(
                new SpotImageCandidate(11L, "https://images.example.com/detail.jpg", null)));
        CourseApplicationService service = new CourseApplicationService(courses, spots, null, null,
                mock(CourseCoverImageSelector.class), new SpotThumbnailResolver(images));

        assertThat(service.listLiked(10L)).hasSize(2).allSatisfy(result ->
                assertThat(result.days().getFirst().spots().getFirst().thumbnail())
                        .isEqualTo("https://images.example.com/detail.jpg"));
        verify(images, times(1)).findBySpotIds(Set.of(11L));
        verifyNoMoreInteractions(images);
        verify(spots, never()).save(any());
        verify(courses, never()).save(any());
        assertThat(missing.thumbnail()).isNull();
    }

    private static SpotModel spot(String title, String category, SpotStatus status) {
        return SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title(title)
                .category(category)
                .status(status)
                .build();
    }

    static class Fixture {
        final InMemoryCourseRepository courses = new InMemoryCourseRepository();
        final InMemorySpotRepository spots = new InMemorySpotRepository();
        final TourDataImageRepository images = mock(TourDataImageRepository.class);

        CourseApplicationService service() {
            return new CourseApplicationService(courses, spots, null, null,
                    new CourseCoverImageSelector(List.of(new CourseCoverImageSelector.Image(
                            "fixture", "https://images.example.com/cover.jpg", List.of(), List.of(), List.of()))),
                    new SpotThumbnailResolver(images));
        }
    }

    static class InMemoryCourseRepository implements CourseRepository {
        private final List<CourseModel> saved = new ArrayList<>();
        private long sequence = 0L;

        @Override
        public CourseModel save(CourseModel course) {
            CourseModel stored = CourseModel.reconstruct(
                    course.courseId() == null ? ++sequence : course.courseId(),
                    course.userId(),
                    course.title(),
                    course.description(),
                    course.thumbnail(),
                    course.visibility(),
                    course.status(),
                    course.viewCount(),
                    course.likeCount(),
                    course.startDate(),
                    course.endDate(),
                    course.days(),
                    course.createdAt(),
                    course.updatedAt()
            );
            saved.removeIf(existing -> existing.courseId().equals(stored.courseId()));
            saved.add(stored);
            return stored;
        }

        @Override
        public Optional<CourseModel> findById(Long courseId) {
            return saved.stream().filter(course -> course.courseId().equals(courseId)).findFirst();
        }

        @Override
        public Optional<CourseModel> findByIdForUpdate(Long courseId) {
            return findById(courseId);
        }

        @Override
        public List<CourseModel> findActiveByUserId(Long userId) {
            return saved.stream()
                    .filter(course -> course.userId().equals(userId))
                    .filter(course -> course.status() == CourseStatus.ACTIVE)
                    .toList();
        }

        @Override
        public List<CourseModel> findActiveByIds(java.util.Collection<Long> courseIds) {
            return saved.stream()
                    .filter(course -> courseIds.contains(course.courseId()))
                    .filter(course -> course.status() == CourseStatus.ACTIVE)
                    .toList();
        }

        /** 좋아요 목록 조회는 이 테스트에서 쓰지 않는다. 조용히 빈 값을 주기보다 호출되면 바로 드러나게 둔다. */
        @Override
        public List<CourseModel> findLikedByUserId(Long userId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<CourseModel> searchPublic(CourseSortType sort, int offset, int limit) {
            return saved.stream()
                    .filter(course -> course.status() == CourseStatus.ACTIVE)
                    .filter(course -> course.visibility() == CourseVisibility.PUBLIC)
                    .sorted((left, right) -> sort == CourseSortType.POPULAR
                            ? Long.compare(right.likeCount(), left.likeCount())
                            : Long.compare(right.courseId(), left.courseId()))
                    .skip(offset)
                    .limit(limit)
                    .toList();
        }

        @Override
        public long countPublic() {
            return saved.stream()
                    .filter(course -> course.status() == CourseStatus.ACTIVE)
                    .filter(course -> course.visibility() == CourseVisibility.PUBLIC)
                    .count();
        }

        @Override
        public void incrementLikeCount(Long courseId) {
            updateLikeCount(courseId, 1);
        }

        @Override
        public void decrementLikeCount(Long courseId) {
            updateLikeCount(courseId, -1);
        }

        private void updateLikeCount(Long courseId, long delta) {
            findById(courseId).ifPresent(course -> {
                CourseModel updated = CourseModel.reconstruct(
                        course.courseId(), course.userId(), course.title(), course.description(),
                        course.thumbnail(), course.visibility(), course.status(), course.viewCount(),
                        Math.max(0, course.likeCount() + delta), course.startDate(), course.endDate(),
                        course.days(), course.createdAt(), course.updatedAt());
                saved.removeIf(existing -> existing.courseId().equals(courseId));
                saved.add(updated);
            });
        }
    }

    static class InMemorySpotRepository implements SpotRepository {

        /** 위시리스트 조회는 이 테스트에서 쓰지 않는다. 조용히 빈 값을 주기보다 호출되면 바로 드러나게 둔다. */
        @Override
        public boolean updateTourApiListing(Long spotId, SpotModel.SourceAttributes attributes) {
            throw new UnsupportedOperationException("Listing collection is outside this test");
        }

        @Override
        public boolean fillTourApiDescriptionIfMissing(Long spotId, String description) {
            throw new UnsupportedOperationException("Description collection is outside this test");
        }

        @Override
        public java.util.List<SpotModel> findLikedByUserId(Long userId) {
            throw new UnsupportedOperationException();
        }
        private final List<SpotModel> saved = new ArrayList<>();
        private long sequence = 0L;
        int findAllByIdInCallCount = 0;

        @Override
        public SpotModel save(SpotModel spot) {
            SpotModel stored = SpotModel.builder()
                    .spotId(spot.spotId() == null ? ++sequence : spot.spotId())
                    .sourceType(spot.sourceType())
                    .attributes(new SpotModel.SourceAttributes(spot.title(), spot.category(), spot.region(),
                            spot.sigungu(), spot.address(), spot.latitude(), spot.longitude(), spot.thumbnail(),
                            spot.description()))
                    .viewCount(spot.viewCount())
                    .likeCount(spot.likeCount())
                    .commentCount(spot.commentCount())
                    .status(spot.status())
                    .createdAt(spot.createdAt())
                    .updatedAt(spot.updatedAt())
                    .build();
            saved.removeIf(existing -> existing.spotId().equals(stored.spotId()));
            saved.add(stored);
            return stored;
        }

        @Override
        public Optional<SpotModel> findById(Long spotId) {
            return saved.stream().filter(spot -> spot.spotId().equals(spotId)).findFirst();
        }

        @Override
        public List<SpotModel> findAllByIdIn(Collection<Long> spotIds) {
            findAllByIdInCallCount++;
            if (spotIds == null || spotIds.isEmpty()) {
                return List.of();
            }
            return saved.stream().filter(s -> spotIds.contains(s.spotId())).toList();
        }

        @Override
        public long countAll() {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<SpotModel> searchActive(SpotSearchCondition condition, SpotSortType sort, int offset, int limit) {
            throw new UnsupportedOperationException();
        }

        @Override
        public long countActive(SpotSearchCondition condition) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void incrementViewCount(Long spotId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void incrementLikeCount(Long spotId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void decrementLikeCount(Long spotId) {
            throw new UnsupportedOperationException();
        }
    }
}
