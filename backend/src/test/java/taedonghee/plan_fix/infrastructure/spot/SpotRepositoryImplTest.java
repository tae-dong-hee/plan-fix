package taedonghee.plan_fix.infrastructure.spot;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSearchCondition;
import taedonghee.plan_fix.domain.spot.SpotSortType;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 공개 목록 조회가 실제 DB에서 필터·정렬·offset/limit대로 동작하는지 본다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class SpotRepositoryImplTest {

    @Autowired
    private SpotRepository spotRepository;

    @Test
    void status가_ACTIVE인_스팟만_반환한다() {
        String tag = tag();
        save(tag, "테스트 스팟", "51", "150", SpotStatus.ACTIVE, 0, 0);
        save(tag, "테스트 스팟", "51", "150", SpotStatus.HIDDEN, 0, 0);

        List<SpotModel> result = spotRepository.searchActive(condition(null, tag, null, null), SpotSortType.LATEST, 0, 20);

        assertThat(result).hasSize(1);
        assertThat(result.getFirst().status()).isEqualTo(SpotStatus.ACTIVE);
    }

    @Test
    void category가_다르면_제외한다() {
        String tag = tag();
        save(tag, "테스트 스팟", "51", "150", SpotStatus.ACTIVE, 0, 0);
        save(tag + "-other", "테스트 스팟", "51", "150", SpotStatus.ACTIVE, 0, 0);

        List<SpotModel> result = spotRepository.searchActive(condition(null, tag, null, null), SpotSortType.LATEST, 0, 20);

        assertThat(result).extracting(SpotModel::category).containsExactly(tag);
    }

    @Test
    void region_sigungu로_필터링한다() {
        String tag = tag();
        SpotModel match = save(tag, "테스트 스팟", "51", "150", SpotStatus.ACTIVE, 0, 0);
        save(tag, "테스트 스팟", "11", "150", SpotStatus.ACTIVE, 0, 0);
        save(tag, "테스트 스팟", "51", "200", SpotStatus.ACTIVE, 0, 0);

        List<SpotModel> result = spotRepository.searchActive(condition(null, tag, "51", "150"), SpotSortType.LATEST, 0, 20);

        assertThat(result).extracting(SpotModel::spotId).containsExactly(match.spotId());
    }

    @Test
    void keyword로_제목_부분_일치_검색이_동작한다() {
        String tag = tag();
        SpotModel match = save(tag, "속초 중앙시장 닭강정", "51", "150", SpotStatus.ACTIVE, 0, 0);
        save(tag, "강릉 카페거리", "51", "150", SpotStatus.ACTIVE, 0, 0);

        List<SpotModel> result = spotRepository.searchActive(condition("속초", tag, null, null), SpotSortType.LATEST, 0, 20);

        assertThat(result).extracting(SpotModel::spotId).containsExactly(match.spotId());
    }

    @Test
    void keyword_검색은_대소문자를_무시한다() {
        String tag = tag();
        SpotModel match = save(tag, "Beach Cafe", "51", "150", SpotStatus.ACTIVE, 0, 0);

        List<SpotModel> result = spotRepository.searchActive(condition("beach", tag, null, null), SpotSortType.LATEST, 0, 20);

        assertThat(result).extracting(SpotModel::spotId).containsExactly(match.spotId());
    }

    @Test
    void 필터가_없으면_spotId_내림차순으로_반환한다() {
        String tag = tag();
        SpotModel first = save(tag, "테스트 스팟", null, null, SpotStatus.ACTIVE, 0, 0);
        SpotModel second = save(tag, "테스트 스팟", null, null, SpotStatus.ACTIVE, 0, 0);

        List<SpotModel> result = spotRepository.searchActive(condition(null, tag, null, null), SpotSortType.LATEST, 0, 20);

        assertThat(result).extracting(SpotModel::spotId).containsExactly(second.spotId(), first.spotId());
    }

    @Test
    void offset과_limit으로_구간을_잘라낸다() {
        String tag = tag();
        save(tag, "테스트 스팟", null, null, SpotStatus.ACTIVE, 0, 0);
        save(tag, "테스트 스팟", null, null, SpotStatus.ACTIVE, 0, 0);
        save(tag, "테스트 스팟", null, null, SpotStatus.ACTIVE, 0, 0);

        List<SpotModel> firstPage = spotRepository.searchActive(condition(null, tag, null, null), SpotSortType.LATEST, 0, 2);
        List<SpotModel> secondPage = spotRepository.searchActive(condition(null, tag, null, null), SpotSortType.LATEST, 2, 2);

        assertThat(firstPage).hasSize(2);
        assertThat(secondPage).hasSize(1);
    }

    @Test
    void POPULAR_정렬은_좋아요_0_9_조회수_0_1_가중합_내림차순이다() {
        String tag = tag();
        SpotModel low = save(tag, "테스트 스팟", null, null, SpotStatus.ACTIVE, 1, 0);
        SpotModel mid = save(tag, "테스트 스팟", null, null, SpotStatus.ACTIVE, 0, 50);
        SpotModel high = save(tag, "테스트 스팟", null, null, SpotStatus.ACTIVE, 10, 0);

        List<SpotModel> result = spotRepository.searchActive(condition(null, tag, null, null), SpotSortType.POPULAR, 0, 20);

        assertThat(result).extracting(SpotModel::spotId)
                .containsExactly(high.spotId(), mid.spotId(), low.spotId());
    }

    @Test
    void countActive는_ACTIVE만_조건대로_센다() {
        String tag = tag();
        save(tag, "테스트 스팟 1", "51", "150", SpotStatus.ACTIVE, 0, 0);
        save(tag, "테스트 스팟 2", "51", "150", SpotStatus.ACTIVE, 0, 0);
        save(tag, "테스트 스팟 3", "51", "150", SpotStatus.HIDDEN, 0, 0);
        save(tag, "테스트 스팟 4", "11", "150", SpotStatus.ACTIVE, 0, 0);

        long count = spotRepository.countActive(condition(null, tag, "51", "150"));

        assertThat(count).isEqualTo(2);
    }

    @Test
    void findAllByIdIn은_여러_ID를_한_번에_조회한다() {
        String tag = tag();
        SpotModel s1 = save(tag, "스팟1", null, null, SpotStatus.ACTIVE, 0, 0);
        SpotModel s2 = save(tag, "스팟2", null, null, SpotStatus.HIDDEN, 0, 0);

        List<SpotModel> result = spotRepository.findAllByIdIn(List.of(s1.spotId(), s2.spotId(), 999999L));

        assertThat(result).extracting(SpotModel::spotId).containsExactlyInAnyOrder(s1.spotId(), s2.spotId());
    }

    @Test
    void findAllByIdIn은_빈_컬렉션을_넘기면_빈_리스트를_반환한다() {
        List<SpotModel> result = spotRepository.findAllByIdIn(List.of());

        assertThat(result).isEmpty();
    }

    @Test
    void 조회수를_원자적으로_1_증가시킨다() {
        SpotModel saved = save(tag(), "테스트 스팟", null, null, SpotStatus.ACTIVE, 0, 5);

        spotRepository.incrementViewCount(saved.spotId());

        SpotModel reloaded = spotRepository.findById(saved.spotId()).orElseThrow();
        assertThat(reloaded.viewCount()).isEqualTo(6);
    }

    @Test
    void 좋아요수를_원자적으로_1_증가시킨다() {
        SpotModel saved = save(tag(), "테스트 스팟", null, null, SpotStatus.ACTIVE, 5, 0);

        spotRepository.incrementLikeCount(saved.spotId());

        SpotModel reloaded = spotRepository.findById(saved.spotId()).orElseThrow();
        assertThat(reloaded.likeCount()).isEqualTo(6);
    }

    @Test
    void 좋아요수를_원자적으로_1_감소시킨다() {
        SpotModel saved = save(tag(), "테스트 스팟", null, null, SpotStatus.ACTIVE, 5, 0);

        spotRepository.decrementLikeCount(saved.spotId());

        SpotModel reloaded = spotRepository.findById(saved.spotId()).orElseThrow();
        assertThat(reloaded.likeCount()).isEqualTo(4);
    }

    @Test
    void 좋아요수는_0_밑으로_내려가지_않는다() {
        SpotModel saved = save(tag(), "테스트 스팟", null, null, SpotStatus.ACTIVE, 0, 0);

        spotRepository.decrementLikeCount(saved.spotId());

        SpotModel reloaded = spotRepository.findById(saved.spotId()).orElseThrow();
        assertThat(reloaded.likeCount()).isEqualTo(0);
    }

    private SpotSearchCondition condition(String keyword, String category, String region, String sigungu) {
        return new SpotSearchCondition(keyword, category, region, sigungu);
    }

    private String tag() {
        return "tag-" + System.nanoTime();
    }

    private SpotModel save(String category, String title, String region, String sigungu, SpotStatus status,
                           long likeCount, long viewCount) {
        SpotModel spot = SpotModel.builder()
                .sourceType(SpotSourceType.TOUR_API)
                .title(title)
                .category(category)
                .region(region)
                .sigungu(sigungu)
                .status(status)
                .likeCount(likeCount)
                .viewCount(viewCount)
                .build();
        return spotRepository.save(spot);
    }
}
