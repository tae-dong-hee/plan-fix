package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import taedonghee.plan_fix.domain.spot.SpotLikeModel;
import taedonghee.plan_fix.domain.spot.SpotLikeRepository;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSearchCondition;
import taedonghee.plan_fix.domain.spot.SpotSortType;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.support.error.CoreException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * idempotency·404·동시성(유니크 제약 위반) 처리만 보는 순수 애플리케이션 단위 테스트라 페이크 저장소를 쓴다.
 * 실제 유니크 제약 위반은 SpotLikeRepositoryImplTest가 담당한다.
 */
class SpotLikeApplicationServiceTest {

    @Test
    void 좋아요하면_liked_true와_증가된_카운트를_반환한다() {
        Fixture fixture = new Fixture();
        SpotModel spot = fixture.spots.save(spotOf(3));

        SpotLikeResult result = fixture.service().like(1L, spot.spotId());

        assertThat(result.liked()).isTrue();
        assertThat(result.likeCount()).isEqualTo(4);
        assertThat(fixture.spots.findById(spot.spotId()).orElseThrow().likeCount()).isEqualTo(4);
        assertThat(fixture.spotLikes.existsByUserIdAndSpotId(1L, spot.spotId())).isTrue();
    }

    @Test
    void 이미_좋아요한_상태에서_또_좋아요하면_카운트가_늘지_않는다() {
        Fixture fixture = new Fixture();
        SpotModel spot = fixture.spots.save(spotOf(3));
        SpotLikeApplicationService service = fixture.service();
        service.like(1L, spot.spotId());

        SpotLikeResult result = service.like(1L, spot.spotId());

        assertThat(result.liked()).isTrue();
        assertThat(result.likeCount()).isEqualTo(4);
        assertThat(fixture.spots.findById(spot.spotId()).orElseThrow().likeCount()).isEqualTo(4);
    }

    @Test
    void 동시에_들어온_좋아요_요청은_유니크_제약_위반을_이미_좋아요됨으로_처리한다() {
        Fixture fixture = new Fixture();
        SpotModel spot = fixture.spots.save(spotOf(3));
        fixture.spotLikes.throwOnNextSave = true;

        SpotLikeResult result = fixture.service().like(1L, spot.spotId());

        assertThat(result.liked()).isTrue();
        // 경쟁에서 진 쪽이라 이 요청 스스로는 카운트를 늘리지 않는다(이긴 쪽이 이미 늘렸다고 가정)
        assertThat(result.likeCount()).isEqualTo(3);
    }

    @Test
    void 취소하면_liked_false와_감소된_카운트를_반환한다() {
        Fixture fixture = new Fixture();
        SpotModel spot = fixture.spots.save(spotOf(3));
        SpotLikeApplicationService service = fixture.service();
        service.like(1L, spot.spotId());

        SpotLikeResult result = service.unlike(1L, spot.spotId());

        assertThat(result.liked()).isFalse();
        assertThat(result.likeCount()).isEqualTo(3);
        assertThat(fixture.spotLikes.existsByUserIdAndSpotId(1L, spot.spotId())).isFalse();
    }

    @Test
    void 좋아요하지_않은_것을_취소하면_카운트가_줄지_않는다() {
        Fixture fixture = new Fixture();
        SpotModel spot = fixture.spots.save(spotOf(3));

        SpotLikeResult result = fixture.service().unlike(1L, spot.spotId());

        assertThat(result.liked()).isFalse();
        assertThat(result.likeCount()).isEqualTo(3);
    }

    @Test
    void 존재하지_않는_스팟에_좋아요하면_404_예외가_발생한다() {
        SpotLikeApplicationService service = new Fixture().service();

        assertThatThrownBy(() -> service.like(1L, 999L)).isInstanceOf(CoreException.class);
    }

    @Test
    void HIDDEN_스팟에_좋아요하면_404_예외가_발생한다() {
        Fixture fixture = new Fixture();
        SpotModel spot = fixture.spots.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("숨김 스팟")
                .category("관광지")
                .status(SpotStatus.HIDDEN)
                .build());

        assertThatThrownBy(() -> fixture.service().like(1L, spot.spotId())).isInstanceOf(CoreException.class);
    }

    private SpotModel spotOf(long likeCount) {
        return SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("경포해수욕장")
                .category("관광지")
                .likeCount(likeCount)
                .build();
    }

    static class Fixture {
        final InMemorySpotRepository spots = new InMemorySpotRepository();
        final InMemorySpotLikeRepository spotLikes = new InMemorySpotLikeRepository();

        SpotLikeApplicationService service() {
            return new SpotLikeApplicationService(spots, spotLikes);
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
            findById(spotId).ifPresent(spot -> save(withLikeCount(spot, spot.likeCount() + 1)));
        }

        @Override
        public void decrementLikeCount(Long spotId) {
            findById(spotId).ifPresent(spot -> save(withLikeCount(spot, Math.max(spot.likeCount() - 1, 0))));
        }

        private SpotModel withLikeCount(SpotModel spot, long likeCount) {
            return SpotModel.builder()
                    .spotId(spot.spotId())
                    .sourceType(spot.sourceType())
                    .attributes(new SpotModel.SourceAttributes(spot.title(), spot.category(), spot.region(),
                            spot.sigungu(), spot.address(), spot.latitude(), spot.longitude(), spot.thumbnail(),
                            spot.description()))
                    .viewCount(spot.viewCount())
                    .likeCount(likeCount)
                    .commentCount(spot.commentCount())
                    .status(spot.status())
                    .createdAt(spot.createdAt())
                    .build();
        }
    }

    /** throwOnNextSave로 동시성 레이스(유니크 제약 위반)를 흉내낸다. */
    static class InMemorySpotLikeRepository implements SpotLikeRepository {

        @Override
        public java.util.Set<Long> findLikedSpotIds(Long userId, java.util.Collection<Long> spotIds) {
            return saved.stream()
                    .filter(l -> l.userId().equals(userId) && spotIds.contains(l.spotId()))
                    .map(SpotLikeModel::spotId)
                    .collect(java.util.stream.Collectors.toSet());
        }
        private final List<SpotLikeModel> saved = new ArrayList<>();
        private long sequence = 0;
        boolean throwOnNextSave = false;

        @Override
        public boolean existsByUserIdAndSpotId(Long userId, Long spotId) {
            return saved.stream().anyMatch(l -> l.userId().equals(userId) && l.spotId().equals(spotId));
        }

        @Override
        public SpotLikeModel save(SpotLikeModel like) {
            if (throwOnNextSave) {
                throwOnNextSave = false;
                throw new DataIntegrityViolationException("duplicate like");
            }
            SpotLikeModel stored = SpotLikeModel.reconstruct(++sequence, like.userId(), like.spotId(), like.createdAt());
            saved.add(stored);
            return stored;
        }

        @Override
        public boolean deleteByUserIdAndSpotId(Long userId, Long spotId) {
            return saved.removeIf(l -> l.userId().equals(userId) && l.spotId().equals(spotId));
        }
    }
}
