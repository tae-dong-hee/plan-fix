package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.spot.SpotLikeModel;
import taedonghee.plan_fix.domain.spot.SpotLikeRepository;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSearchCondition;
import taedonghee.plan_fix.domain.spot.SpotSortType;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.spot.TourDataImageModel;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;
import taedonghee.plan_fix.domain.spot.TourDataInfoModel;
import taedonghee.plan_fix.domain.spot.TourDataInfoRepository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.support.error.CoreException;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 검증·404 처리·조회수 증가 반영·TourAPI 부가 데이터 병합·좋아요 여부 반영만 보는 순수
 * 애플리케이션 단위 테스트라 페이크 저장소를 쓴다. 실제 조인/조회 SQL은 각 RepositoryImplTest가 담당한다.
 */
class SpotDetailApplicationServiceTest {

    @Test
    void 정상_조회하면_전체_필드를_돌려주고_조회수를_1_늘린다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("경포해수욕장")
                .category("관광지")
                .region("51")
                .sigungu("150")
                .address("강원특별자치도 강릉시")
                .latitude(new BigDecimal("37.8127061"))
                .longitude(new BigDecimal("128.8987999"))
                .thumbnail("thumb.jpg")
                .description("동해안의 대표 해수욕장")
                .likeCount(3)
                .commentCount(1)
                .viewCount(10)
                .build());

        SpotDetailResult result = fixture.service().get(saved.spotId(), null);

        assertThat(result.spotId()).isEqualTo(saved.spotId());
        assertThat(result.title()).isEqualTo("경포해수욕장");
        assertThat(result.category()).isEqualTo("관광지");
        assertThat(result.region()).isEqualTo("51");
        assertThat(result.sigungu()).isEqualTo("150");
        assertThat(result.address()).isEqualTo("강원특별자치도 강릉시");
        assertThat(result.latitude()).isEqualByComparingTo("37.8127061");
        assertThat(result.longitude()).isEqualByComparingTo("128.8987999");
        assertThat(result.thumbnail()).isEqualTo("thumb.jpg");
        assertThat(result.description()).isEqualTo("동해안의 대표 해수욕장");
        assertThat(result.likeCount()).isEqualTo(3);
        assertThat(result.commentCount()).isEqualTo(1);
        // 조회 시점에 +1 된 값을 응답에 바로 반영한다
        assertThat(result.viewCount()).isEqualTo(11);
        assertThat(result.isLiked()).isFalse();
    }

    @Test
    void 조회할_때마다_저장소의_조회수를_실제로_증가시킨다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("경포해수욕장")
                .category("관광지")
                .viewCount(0)
                .build());
        SpotDetailApplicationService service = fixture.service();

        service.get(saved.spotId(), null);
        service.get(saved.spotId(), null);

        assertThat(fixture.spots.findById(saved.spotId()).orElseThrow().viewCount()).isEqualTo(2);
    }

    @Test
    void 존재하지_않으면_404_예외가_발생한다() {
        SpotDetailApplicationService service = new Fixture().service();

        assertThatThrownBy(() -> service.get(999L, null)).isInstanceOf(CoreException.class);
    }

    @Test
    void HIDDEN_상태면_404_예외가_발생한다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("숨김 스팟")
                .category("관광지")
                .status(SpotStatus.HIDDEN)
                .build());

        assertThatThrownBy(() -> fixture.service().get(saved.spotId(), null)).isInstanceOf(CoreException.class);
    }

    @Test
    void NATIVE_스팟은_TourAPI_부가정보를_붙이지_않는다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("직접등록 스팟")
                .category("관광지")
                .build());
        // NATIVE인데도 tour_data_spots에 연결이 있다면(있을 수 없는 상황이지만) 무시해야 한다는 것까지 확인
        fixture.tourDataSpots.save(TourDataSpotModel.builder()
                .contentId(1L).spotId(saved.spotId()).title("직접등록 스팟").build());

        SpotDetailResult result = fixture.service().get(saved.spotId(), null);

        assertThat(result.images()).isEmpty();
        assertThat(result.info()).isNull();
    }

    @Test
    void TOUR_API_스팟이지만_아직_수집되지_않았으면_빈값을_돌려준다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.TOUR_API)
                .title("아직 수집 전")
                .category("관광지")
                .build());
        // tourDataSpots에 연결된 행이 아예 없는 상태

        SpotDetailResult result = fixture.service().get(saved.spotId(), null);

        assertThat(result.images()).isEmpty();
        assertThat(result.info()).isNull();
    }

    @Test
    void TOUR_API_스팟이면_사진과_상세정보를_함께_붙인다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.TOUR_API)
                .title("경포해수욕장")
                .category("관광지")
                .build());
        TourDataSpotModel tourDataSpot = fixture.tourDataSpots.save(TourDataSpotModel.builder()
                .contentId(12345L)
                .spotId(saved.spotId())
                .title("경포해수욕장")
                .build());
        fixture.tourDataImages.saveAll(List.of(
                TourDataImageModel.builder()
                        .tourDataSpotId(tourDataSpot.tourDataSpotId())
                        .contentId(12345L)
                        .originalImage("http://example.com/1.jpg")
                        .build(),
                TourDataImageModel.builder()
                        .tourDataSpotId(tourDataSpot.tourDataSpotId())
                        .contentId(12345L)
                        .originalImage("http://example.com/2.jpg")
                        .build()
        ));
        fixture.tourDataInfos.save(TourDataInfoModel.builder()
                .tourDataSpotId(tourDataSpot.tourDataSpotId())
                .contentId(12345L)
                .tel("033-000-0000")
                .parkInfo("가능")
                .timeInfo("09:00~18:00")
                .restInfo("연중무휴")
                .build());

        SpotDetailResult result = fixture.service().get(saved.spotId(), null);

        assertThat(result.images()).containsExactly("http://example.com/1.jpg", "http://example.com/2.jpg");
        assertThat(result.thumbnail()).isEqualTo("http://example.com/1.jpg");
        assertThat(saved.thumbnail()).isNull();
        assertThat(result.info()).isNotNull();
        assertThat(result.info().tel()).isEqualTo("033-000-0000");
        assertThat(result.info().parkInfo()).isEqualTo("가능");
        assertThat(result.info().timeInfo()).isEqualTo("09:00~18:00");
        assertThat(result.info().restInfo()).isEqualTo("연중무휴");
        assertThat(result.info().firstMenu()).isNull();
    }

    @Test
    void 로그인한_사용자가_좋아요한_스팟이면_isLiked가_true다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("경포해수욕장")
                .category("관광지")
                .build());
        fixture.spotLikes.save(SpotLikeModel.create(10L, saved.spotId()));

        SpotDetailResult result = fixture.service().get(saved.spotId(), 10L);

        assertThat(result.isLiked()).isTrue();
    }

    @Test
    void 좋아요하지_않았으면_isLiked가_false다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("경포해수욕장")
                .category("관광지")
                .build());

        SpotDetailResult result = fixture.service().get(saved.spotId(), 10L);

        assertThat(result.isLiked()).isFalse();
    }

    @Test
    void 비로그인이면_다른_사람이_좋아요했어도_isLiked가_false다() {
        Fixture fixture = new Fixture();
        SpotModel saved = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("경포해수욕장")
                .category("관광지")
                .build());
        fixture.spotLikes.save(SpotLikeModel.create(10L, saved.spotId()));

        SpotDetailResult result = fixture.service().get(saved.spotId(), null);

        assertThat(result.isLiked()).isFalse();
    }

    /** 테스트 대상과 페이크 저장소 5종을 묶은 픽스처. */
    static class Fixture {
        final InMemorySpotRepository spots = new InMemorySpotRepository();
        final InMemoryTourDataSpotRepository tourDataSpots = new InMemoryTourDataSpotRepository();
        final InMemoryTourDataInfoRepository tourDataInfos = new InMemoryTourDataInfoRepository();
        final InMemoryTourDataImageRepository tourDataImages = new InMemoryTourDataImageRepository();
        final InMemorySpotLikeRepository spotLikes = new InMemorySpotLikeRepository();

        SpotDetailApplicationService service() {
            return new SpotDetailApplicationService(spots, tourDataSpots, tourDataInfos, tourDataImages, spotLikes);
        }
    }

    /** 조건에 맞는 것만 걸러 spotId 내림차순으로 돌려주는 메모리 페이크. */
    static class InMemorySpotRepository implements SpotRepository {

        /** 위시리스트 조회는 이 테스트에서 쓰지 않는다. 조용히 빈 값을 주기보다 호출되면 바로 드러나게 둔다. */
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
            saved.removeIf(s -> s.spotId().equals(stored.spotId()));
            saved.add(stored);
            return stored;
        }

        @Override
        public Optional<SpotModel> findById(Long spotId) {
            return saved.stream().filter(s -> s.spotId().equals(spotId)).findFirst();
        }

        @Override
        public List<SpotModel> findAllByIdIn(java.util.Collection<Long> spotIds) {
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
            throw new UnsupportedOperationException();
        }

        @Override
        public long countActive(SpotSearchCondition condition) {
            throw new UnsupportedOperationException();
        }

        @Override
        public void incrementViewCount(Long spotId) {
            findById(spotId).ifPresent(spot -> save(SpotModel.builder()
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
                    .build()));
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

    static class InMemoryTourDataSpotRepository implements TourDataSpotRepository {
        private final List<TourDataSpotModel> saved = new ArrayList<>();
        private long sequence = 0;

        @Override
        public TourDataSpotModel save(TourDataSpotModel tourDataSpot) {
            TourDataSpotModel stored = TourDataSpotModel.builder()
                    .tourDataSpotId(tourDataSpot.tourDataSpotId() == null ? ++sequence : tourDataSpot.tourDataSpotId())
                    .contentId(tourDataSpot.contentId())
                    .spotId(tourDataSpot.spotId())
                    .title(tourDataSpot.title())
                    .build();
            saved.add(stored);
            return stored;
        }

        @Override
        public Optional<TourDataSpotModel> findByContentId(Long contentId) {
            return saved.stream().filter(s -> s.contentId().equals(contentId)).findFirst();
        }

        @Override
        public Optional<TourDataSpotModel> findBySpotId(Long spotId) {
            return saved.stream().filter(s -> spotId.equals(s.spotId())).findFirst();
        }

        @Override
        public List<TourDataSpotModel> findByRegionAndSigungu(String reg, String sigungu) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<TourDataSpotModel> findByRegionAndSigunguAndImageNotCollected(String reg, String sigungu) {
            throw new UnsupportedOperationException();
        }

        @Override
        public List<TourDataSpotModel> findByRegionAndSigunguAndInfoNotCollected(String reg, String sigungu) {
            throw new UnsupportedOperationException();
        }

        @Override
        public long countAll() {
            return saved.size();
        }
    }

    static class InMemoryTourDataInfoRepository implements TourDataInfoRepository {
        private final List<TourDataInfoModel> saved = new ArrayList<>();
        private long sequence = 0;

        @Override
        public TourDataInfoModel save(TourDataInfoModel info) {
            TourDataInfoModel stored = TourDataInfoModel.builder()
                    .tourDataInfoId(++sequence)
                    .tourDataSpotId(info.tourDataSpotId())
                    .contentId(info.contentId())
                    .category(info.category())
                    .firstMenu(info.firstMenu())
                    .treatMenu(info.treatMenu())
                    .tel(info.tel())
                    .parkInfo(info.parkInfo())
                    .timeInfo(info.timeInfo())
                    .restInfo(info.restInfo())
                    .lcnsno(info.lcnsno())
                    .build();
            saved.add(stored);
            return stored;
        }

        @Override
        public Optional<TourDataInfoModel> findByContentId(Long contentId) {
            return saved.stream().filter(i -> i.contentId().equals(contentId)).findFirst();
        }

        @Override
        public long countAll() {
            return saved.size();
        }
    }

    static class InMemoryTourDataImageRepository implements TourDataImageRepository {
        private final List<TourDataImageModel> saved = new ArrayList<>();
        private long sequence = 0;

        @Override
        public List<taedonghee.plan_fix.domain.spot.SpotImageCandidate> findBySpotIds(java.util.Collection<Long> spotIds) {
            throw new AssertionError("상세 조회는 이미 조회한 사진을 재사용해야 한다");
        }

        @Override
        public TourDataImageModel save(TourDataImageModel image) {
            TourDataImageModel stored = TourDataImageModel.builder()
                    .tourDataImageId(++sequence)
                    .tourDataSpotId(image.tourDataSpotId())
                    .contentId(image.contentId())
                    .imageName(image.imageName())
                    .originalImage(image.originalImage())
                    .smallImage(image.smallImage())
                    .build();
            saved.add(stored);
            return stored;
        }

        @Override
        public void saveAll(List<TourDataImageModel> images) {
            images.forEach(this::save);
        }

        @Override
        public List<TourDataImageModel> findByTourDataSpotId(Long tourDataSpotId) {
            return saved.stream().filter(i -> i.tourDataSpotId().equals(tourDataSpotId)).toList();
        }

        @Override
        public void deleteByTourDataSpotId(Long tourDataSpotId) {
            saved.removeIf(i -> i.tourDataSpotId().equals(tourDataSpotId));
        }

        @Override
        public long countAll() {
            return saved.size();
        }
    }

    static class InMemorySpotLikeRepository implements SpotLikeRepository {

        @Override
        public java.util.Set<Long> findLikedSpotIds(Long userId, java.util.Collection<Long> spotIds) {
            return saved.stream()
                    .filter(l -> l.userId().equals(userId) && spotIds.contains(l.spotId()))
                    .map(SpotLikeModel::spotId)
                    .collect(java.util.stream.Collectors.toSet());
        }
        private final List<SpotLikeModel> saved = new ArrayList<>();

        @Override
        public boolean existsByUserIdAndSpotId(Long userId, Long spotId) {
            return saved.stream().anyMatch(l -> l.userId().equals(userId) && l.spotId().equals(spotId));
        }

        @Override
        public SpotLikeModel save(SpotLikeModel like) {
            saved.add(like);
            return like;
        }

        @Override
        public boolean deleteByUserIdAndSpotId(Long userId, Long spotId) {
            return saved.removeIf(l -> l.userId().equals(userId) && l.spotId().equals(spotId));
        }
    }
}
