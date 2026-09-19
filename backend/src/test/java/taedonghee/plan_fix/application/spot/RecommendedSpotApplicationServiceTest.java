package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import taedonghee.plan_fix.domain.spot.RecommendedSpotRepository;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;
import taedonghee.plan_fix.domain.spot.SpotLikeRepository;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;
import taedonghee.plan_fix.support.error.CoreException;

import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class RecommendedSpotApplicationServiceTest {

    private final RecommendedSpotRepository repository = mock(RecommendedSpotRepository.class);
    private final SpotLikeRepository likes = mock(SpotLikeRepository.class);
    private final TourDataImageRepository images = mock(TourDataImageRepository.class);
    private final RecommendedSpotCatalog catalog = new RecommendedSpotCatalog(List.of(
            new RecommendedSpotCatalog.Place("남이섬", "110"),
            new RecommendedSpotCatalog.Place("경포해수욕장", "150"),
            new RecommendedSpotCatalog.Place("강릉 오죽헌·시립박물관", "150")));
    private final RecommendedSpotApplicationService service = new RecommendedSpotApplicationService(
            repository, catalog, likes, new SpotThumbnailResolver(images), new Random(42));

    @Test
    void 선정된_공개_TourAPI_장소만_정확한_이름과_시군구로_검증한다() {
        when(repository.findActiveCandidates(catalog.titles(null), "51", null)).thenReturn(List.of(
                spot(1, "남이섬", "110").build(),
                spot(2, "경포해수욕장", "150").build(),
                spot(3, "강릉 오죽헌·시립박물관", "150").category("문화시설").build(),
                spot(4, "남이섬", "150").build(),
                spot(5, "미선정 장소", "150").build(),
                spot(6, "남이섬", "110").region("11").build(),
                spot(7, "경포해수욕장", "150").status(SpotStatus.HIDDEN).build(),
                spot(8, "남이섬", "110").sourceType(SpotSourceType.NATIVE).build()));

        SpotListResult result = service.list(new RecommendedSpotQuery(null, null, 20), null);

        assertThat(result.items()).extracting(SpotListResult.Item::spotId).containsExactlyInAnyOrder(1L, 2L, 3L);
        assertThat(result.items()).allMatch(item -> !item.isLiked());
        assertThat(result.totalCount()).isEqualTo(3);
        assertThat(result.offset()).isZero();
        assertThat(result.size()).isEqualTo(20);
        verify(repository).findActiveCandidates(catalog.titles(null), "51", null);
        verifyNoMoreInteractions(repository);
        verifyNoInteractions(likes, images);
    }

    @Test
    void 중복_ID와_같은_장소의_중복수집을_제거한다() {
        SpotModel duplicate = spot(2, "남이섬", "110").build();
        when(repository.findActiveCandidates(catalog.titles(null), "51", null)).thenReturn(List.of(
                duplicate, duplicate, spot(1, "남이섬", "110").build(), spot(3, "경포해수욕장", "150").build()));

        SpotListResult result = service.list(new RecommendedSpotQuery("51", null, 20), null);

        assertThat(result.items()).extracting(SpotListResult.Item::spotId).containsExactlyInAnyOrder(1L, 3L);
        assertThat(result.totalCount()).isEqualTo(2);
    }

    @Test
    void 지역_선택은_해당_시군구의_선정된_후보만_조회한다() {
        when(repository.findActiveCandidates(catalog.titles("150"), "51", "150")).thenReturn(List.of(
                spot(1, "남이섬", "110").build(), spot(2, "경포해수욕장", "150").build()));

        SpotListResult result = service.list(new RecommendedSpotQuery("51", " 150 ", 20), null);

        assertThat(result.items()).extracting(SpotListResult.Item::spotId).containsExactly(2L);
        assertThat(result.totalCount()).isEqualTo(1);
        verify(repository).findActiveCandidates(List.of("경포해수욕장", "강릉 오죽헌·시립박물관"), "51", "150");
    }

    @Test
    void 강원_외_지역이나_미지원_시군구는_다른_인기장소로_채우지_않는다() {
        assertThat(service.list(new RecommendedSpotQuery("11", null, 20), null).items()).isEmpty();
        assertThat(service.list(new RecommendedSpotQuery("51", "999", 20), null).totalCount()).isZero();
        verifyNoInteractions(repository, likes, images);
    }

    @Test
    void 숨김이나_미수집으로_후보가_없으면_빈_목록을_반환한다() {
        when(repository.findActiveCandidates(catalog.titles(null), "51", null)).thenReturn(List.of());

        SpotListResult result = service.list(new RecommendedSpotQuery("51", null, 20), 10L);

        assertThat(result.items()).isEmpty();
        assertThat(result.totalCount()).isZero();
        verifyNoInteractions(likes, images);
    }

    @Test
    void 요청마다_전체_후보를_다시_섞어서_요청_크기만큼_중복없이_선택한다() {
        List<SpotModel> candidates = IntStream.rangeClosed(1, 360)
                .mapToObj(id -> spot(id, "대표 장소 " + id, "150").build()).toList();
        RecommendedSpotCatalog largeCatalog = new RecommendedSpotCatalog(candidates.stream()
                .map(spot -> new RecommendedSpotCatalog.Place(spot.title(), spot.sigungu())).toList());
        RecommendedSpotApplicationService randomService = new RecommendedSpotApplicationService(
                repository, largeCatalog, likes, new SpotThumbnailResolver(images), new Random(42));
        when(repository.findActiveCandidates(largeCatalog.titles(null), "51", null)).thenReturn(candidates);

        SpotListResult first = randomService.list(new RecommendedSpotQuery("51", null, 20), null);
        SpotListResult next = randomService.list(new RecommendedSpotQuery("51", null, 20), null);

        assertThat(first.items()).hasSize(20);
        assertThat(next.items()).hasSize(20);
        assertThat(first.totalCount()).isEqualTo(360);
        assertThat(first.items()).extracting(SpotListResult.Item::spotId).doesNotHaveDuplicates();
        assertThat(next.items()).extracting(SpotListResult.Item::spotId).doesNotHaveDuplicates();
        // 고정 테스트 시드로 순서뿐 아니라 선택된 부분집합도 달라짐을 재현 가능하게 검증한다.
        assertThat(Set.copyOf(first.items())).isNotEqualTo(Set.copyOf(next.items()));
        assertThat(first.items()).allMatch(item -> item.spotId() >= 1 && item.spotId() <= 360);
        assertThat(randomService.list(new RecommendedSpotQuery("51", null, 100), null).items()).hasSize(100);
    }

    @Test
    void 좋아요와_대표사진_상세사진을_선택된_목록에_일괄_반영한다() {
        SpotModel cover = spot(1, "남이섬", "110").build();
        SpotModel detail = spot(2, "경포해수욕장", "150").thumbnail(null).build();
        when(repository.findActiveCandidates(catalog.titles(null), "51", null)).thenReturn(List.of(cover, detail));
        when(likes.findLikedSpotIds(eq(10L), anyList())).thenReturn(Set.of(2L));
        when(images.findBySpotIds(Set.of(2L))).thenReturn(List.of(
                new SpotImageCandidate(2L, "https://example.com/detail.jpg", null)));

        SpotListResult result = service.list(new RecommendedSpotQuery("51", null, 20), 10L);

        assertThat(result.items()).filteredOn(item -> item.spotId().equals(1L)).singleElement().satisfies(item -> {
            assertThat(item.isLiked()).isFalse();
            assertThat(item.thumbnail()).isEqualTo("https://example.com/cover.jpg");
        });
        assertThat(result.items()).filteredOn(item -> item.spotId().equals(2L)).singleElement().satisfies(item -> {
            assertThat(item.isLiked()).isTrue();
            assertThat(item.thumbnail()).isEqualTo("https://example.com/detail.jpg");
        });
        verify(likes).findLikedSpotIds(eq(10L), anyList());
        verify(images).findBySpotIds(Set.of(2L));
        verifyNoMoreInteractions(likes, images);
        assertThat(detail.thumbnail()).isNull();
    }

    @ParameterizedTest
    @ValueSource(ints = {-1, 0, 101})
    void 잘못된_크기는_조회_전에_거절한다(int size) {
        assertThatThrownBy(() -> service.list(new RecommendedSpotQuery("51", null, size), null))
                .isInstanceOf(CoreException.class).hasMessageContaining("size는 1~100");
        verifyNoInteractions(repository, likes, images);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 100})
    void 유효한_크기_경계값은_허용한다(int size) {
        when(repository.findActiveCandidates(any(), eq("51"), eq(null))).thenReturn(List.of());
        assertThat(service.list(new RecommendedSpotQuery("51", null, size), null).size()).isEqualTo(size);
    }

    private SpotModel.Builder spot(long id, String title, String sigungu) {
        return SpotModel.builder().spotId(id).sourceType(SpotSourceType.TOUR_API).title(title)
                .category("관광지").region("51").sigungu(sigungu).thumbnail("https://example.com/cover.jpg");
    }
}
