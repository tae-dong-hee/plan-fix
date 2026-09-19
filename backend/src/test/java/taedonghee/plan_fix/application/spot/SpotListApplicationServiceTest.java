package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSearchCondition;
import taedonghee.plan_fix.domain.spot.SpotSortType;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.support.error.CoreException;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 검증과 도메인 -> 응답 매핑만 보는 순수 애플리케이션 단위 테스트라 페이크 저장소를 쓴다.
 * 실제 SQL 필터링/정렬은 SpotRepositoryImplTest가 담당한다.
 */
class SpotListApplicationServiceTest {

    @Test
    void 대표사진_상세사진_사진없음을_목록응답에_구분해_반영한다() {
        InMemorySpotRepository repository = new InMemorySpotRepository();
        SpotModel cover = repository.save(spot("대표사진", "관광지", "51", "150", "cover.jpg"));
        SpotModel detail = repository.save(spot("상세사진", "관광지", "51", "150", null));
        SpotModel empty = repository.save(spot("사진없음", "관광지", "51", "150", null));
        var images = org.mockito.Mockito.mock(taedonghee.plan_fix.domain.spot.TourDataImageRepository.class);
        org.mockito.Mockito.when(images.findBySpotIds(java.util.Set.of(detail.spotId(), empty.spotId())))
                .thenReturn(List.of(new taedonghee.plan_fix.domain.spot.SpotImageCandidate(
                        detail.spotId(), "https://example.com/detail.jpg", null)));
        SpotListApplicationService service = new SpotListApplicationService(
                repository, new NoOpSpotLikeRepository(), new SpotThumbnailResolver(images));

        SpotListResult result = service.list(new SpotListQuery(null, null, null, null, null, 0, 20));

        assertThat(result.items()).extracting(SpotListResult.Item::thumbnail)
                .containsExactly(null, "https://example.com/detail.jpg", "cover.jpg");
        assertThat(result.items()).extracting(SpotListResult.Item::spotId)
                .containsExactly(empty.spotId(), detail.spotId(), cover.spotId());
        assertThat(result.totalCount()).isEqualTo(3);
        assertThat(repository.findById(detail.spotId()).orElseThrow().thumbnail()).isNull();
        org.mockito.Mockito.verify(images).findBySpotIds(java.util.Set.of(detail.spotId(), empty.spotId()));
        org.mockito.Mockito.verifyNoMoreInteractions(images);
    }

    @Test
    void 목록과_totalCount를_함께_반환한다() {
        InMemorySpotRepository repository = new InMemorySpotRepository();
        repository.save(spot("정동진", "관광지", "51", "150", "thumb.jpg"));
        repository.save(spot("경포대", "관광지", "51", "150", "thumb2.jpg"));
        SpotListApplicationService service = new SpotListApplicationService(repository, new NoOpSpotLikeRepository(), thumbnailResolver());

        SpotListResult result = service.list(new SpotListQuery(null, null, null, null, null, 0, 20));

        assertThat(result.totalCount()).isEqualTo(2);
        assertThat(result.items()).hasSize(2);
        // spotId 내림차순이라 나중에 저장한 경포대가 먼저 온다
        SpotListResult.Item item = result.items().getFirst();
        assertThat(item.title()).isEqualTo("경포대");
        assertThat(item.category()).isEqualTo("관광지");
        assertThat(item.region()).isEqualTo("51");
        assertThat(item.sigungu()).isEqualTo("150");
        assertThat(item.thumbnail()).isEqualTo("thumb2.jpg");
        assertThat(item.spotId()).isNotNull();
    }

    @Test
    @DisplayName("keyword가 주어지면 SpotSearchCondition에 keyword가 전달된다")
    void keyword_is_passed_to_condition() {
        RecordingSpotRepository repository = new RecordingSpotRepository();
        SpotListApplicationService service = new SpotListApplicationService(repository, new NoOpSpotLikeRepository(), thumbnailResolver());

        service.list(new SpotListQuery(" 속초 ", null, null, null, null, 0, 20));

        assertThat(repository.lastCondition.keyword()).isEqualTo("속초");
    }

    @Test
    @DisplayName("keyword가 빈 문자열이나 공백이면 null로 정규화된다")
    void blank_keyword_normalizes_to_null() {
        RecordingSpotRepository repository = new RecordingSpotRepository();
        SpotListApplicationService service = new SpotListApplicationService(repository, new NoOpSpotLikeRepository(), thumbnailResolver());

        service.list(new SpotListQuery("   ", null, null, null, null, 0, 20));

        assertThat(repository.lastCondition.keyword()).isNull();
    }

    @Test
    void offset과_size를_그대로_결과에_담아_돌려준다() {
        InMemorySpotRepository repository = new InMemorySpotRepository();
        SpotListApplicationService service = new SpotListApplicationService(repository, new NoOpSpotLikeRepository(), thumbnailResolver());

        SpotListResult result = service.list(new SpotListQuery(null, null, null, null, null, 10, 5));

        assertThat(result.offset()).isEqualTo(10);
        assertThat(result.size()).isEqualTo(5);
    }

    @Test
    void offset이_음수면_예외가_발생한다() {
        SpotListApplicationService service = new SpotListApplicationService(new InMemorySpotRepository(), new NoOpSpotLikeRepository(), thumbnailResolver());

        assertThatThrownBy(() -> service.list(new SpotListQuery(null, null, null, null, null, -1, 20)))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void size가_0이면_예외가_발생한다() {
        SpotListApplicationService service = new SpotListApplicationService(new InMemorySpotRepository(), new NoOpSpotLikeRepository(), thumbnailResolver());

        assertThatThrownBy(() -> service.list(new SpotListQuery(null, null, null, null, null, 0, 0)))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void size가_100을_넘으면_예외가_발생한다() {
        SpotListApplicationService service = new SpotListApplicationService(new InMemorySpotRepository(), new NoOpSpotLikeRepository(), thumbnailResolver());

        assertThatThrownBy(() -> service.list(new SpotListQuery(null, null, null, null, null, 0, 101)))
                .isInstanceOf(CoreException.class);
    }

    @Test
    void sort가_없으면_LATEST로_저장소에_넘긴다() {
        RecordingSpotRepository repository = new RecordingSpotRepository();
        SpotListApplicationService service = new SpotListApplicationService(repository, new NoOpSpotLikeRepository(), thumbnailResolver());

        service.list(new SpotListQuery(null, null, null, null, null, 0, 20));

        assertThat(repository.lastSort).isEqualTo(SpotSortType.LATEST);
    }

    @Test
    void sort_popular이면_POPULAR로_저장소에_넘긴다() {
        RecordingSpotRepository repository = new RecordingSpotRepository();
        SpotListApplicationService service = new SpotListApplicationService(repository, new NoOpSpotLikeRepository(), thumbnailResolver());

        service.list(new SpotListQuery(null, null, null, null, "popular", 0, 20));

        assertThat(repository.lastSort).isEqualTo(SpotSortType.POPULAR);
    }

    @Test
    void sort_latest이면_LATEST로_저장소에_넘긴다() {
        RecordingSpotRepository repository = new RecordingSpotRepository();
        SpotListApplicationService service = new SpotListApplicationService(repository, new NoOpSpotLikeRepository(), thumbnailResolver());

        service.list(new SpotListQuery(null, null, null, null, "latest", 0, 20));

        assertThat(repository.lastSort).isEqualTo(SpotSortType.LATEST);
    }

    @Test
    void sort가_알수없는_값이면_예외가_발생한다() {
        SpotListApplicationService service = new SpotListApplicationService(new InMemorySpotRepository(), new NoOpSpotLikeRepository(), thumbnailResolver());

        assertThatThrownBy(() -> service.list(new SpotListQuery(null, null, null, null, "trending", 0, 20)))
                .isInstanceOf(CoreException.class);
    }

    private SpotThumbnailResolver thumbnailResolver() {
        return new SpotThumbnailResolver(org.mockito.Mockito.mock(taedonghee.plan_fix.domain.spot.TourDataImageRepository.class));
    }

    private SpotModel spot(String title, String category, String region, String sigungu, String thumbnail) {
        return SpotModel.builder()
                .sourceType(SpotSourceType.TOUR_API)
                .title(title)
                .category(category)
                .region(region)
                .sigungu(sigungu)
                .thumbnail(thumbnail)
                .build();
    }

    /** 조건에 맞는 것만 걸러 spotId 내림차순으로 돌려주는 메모리 페이크. */
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
        private long sequence = 0;

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
                    .build();
            saved.add(stored);
            return stored;
        }

        @Override
        public Optional<SpotModel> findById(Long spotId) {
            return saved.stream().filter(s -> s.spotId().equals(spotId)).findFirst();
        }

        @Override
        public List<SpotModel> findAllByIdIn(Collection<Long> spotIds) {
            if (spotIds == null || spotIds.isEmpty()) {
                return List.of();
            }
            return saved.stream().filter(s -> spotIds.contains(s.spotId())).toList();
        }

        @Override
        public long countAll() {
            return saved.size();
        }

        @Override
        public List<SpotModel> searchActive(SpotSearchCondition condition, SpotSortType sort, int offset, int limit) {
            return matching(condition).stream()
                    .sorted((a, b) -> Long.compare(b.spotId(), a.spotId()))
                    .skip(offset)
                    .limit(limit)
                    .toList();
        }

        @Override
        public long countActive(SpotSearchCondition condition) {
            return matching(condition).size();
        }

        @Override
        public void incrementViewCount(Long spotId) {
            saved.stream().filter(s -> s.spotId().equals(spotId)).findFirst().ifPresent(spot -> {
                SpotModel updated = SpotModel.builder()
                        .spotId(spot.spotId())
                        .sourceType(spot.sourceType())
                        .attributes(new SpotModel.SourceAttributes(spot.title(), spot.category(), spot.region(),
                                spot.sigungu(), spot.address(), spot.latitude(), spot.longitude(), spot.thumbnail(),
                                spot.description()))
                        .viewCount(spot.viewCount() + 1)
                        .likeCount(spot.likeCount())
                        .commentCount(spot.commentCount())
                        .status(spot.status())
                        .createdAt(spot.createdAt())
                        .build();
                saved.remove(spot);
                saved.add(updated);
            });
        }

        @Override
        public void incrementLikeCount(Long spotId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void decrementLikeCount(Long spotId) {
            throw new UnsupportedOperationException();
        }

        private List<SpotModel> matching(SpotSearchCondition condition) {
            return saved.stream()
                    .filter(s -> condition.keyword() == null || s.title().toLowerCase().contains(condition.keyword().toLowerCase()))
                    .filter(s -> condition.category() == null || condition.category().equals(s.category()))
                    .filter(s -> condition.region() == null || condition.region().equals(s.region()))
                    .filter(s -> condition.sigungu() == null || condition.sigungu().equals(s.sigungu()))
                    .toList();
        }
    }

    /** 서비스가 어떤 SpotSortType과 condition을 넘기는지만 기록하는 페이크. */
    static class RecordingSpotRepository implements SpotRepository {

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
        SpotSortType lastSort;
        SpotSearchCondition lastCondition;

        @Override
        public SpotModel save(SpotModel spot) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Optional<SpotModel> findById(Long spotId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<SpotModel> findAllByIdIn(Collection<Long> spotIds) {
            throw new UnsupportedOperationException();
        }

        @Override
        public long countAll() {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<SpotModel> searchActive(SpotSearchCondition condition, SpotSortType sort, int offset, int limit) {
            this.lastSort = sort;
            this.lastCondition = condition;
            return List.of();
        }

        @Override
        public long countActive(SpotSearchCondition condition) {
            this.lastCondition = condition;
            return 0;
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

    /** 목록 조회 테스트는 좋아요 여부를 보지 않는다(viewerUserId=null이라 호출되지 않음). */
    static class NoOpSpotLikeRepository implements taedonghee.plan_fix.domain.spot.SpotLikeRepository {
        @Override
        public boolean existsByUserIdAndSpotId(Long userId, Long spotId) {
            throw new UnsupportedOperationException();
        }

        @Override
        public java.util.Set<Long> findLikedSpotIds(Long userId, Collection<Long> spotIds) {
            throw new UnsupportedOperationException();
        }

        @Override
        public taedonghee.plan_fix.domain.spot.SpotLikeModel save(taedonghee.plan_fix.domain.spot.SpotLikeModel like) {
            throw new UnsupportedOperationException();
        }

        @Override
        public boolean deleteByUserIdAndSpotId(Long userId, Long spotId) {
            throw new UnsupportedOperationException();
        }
    }
}
