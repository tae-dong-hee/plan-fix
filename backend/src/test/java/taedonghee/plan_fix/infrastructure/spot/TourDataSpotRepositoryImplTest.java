package taedonghee.plan_fix.infrastructure.spot;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * spot_id로 canonical spot에 연결된 원본(tour_data_spots)을 역참조하는지 본다.
 * 상세 조회가 TourAPI 부가 데이터(정보/이미지)를 찾아가는 첫 단계라 실제 저장소를 쓴다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class TourDataSpotRepositoryImplTest {

    @Autowired
    private TourDataSpotRepository tourDataSpotRepository;

    @Autowired
    private SpotRepository spotRepository;

    @Test
    void spotId로_연결된_tour_data_spots를_찾는다() {
        SpotModel spot = spotRepository.save(SpotModel.builder()
                .sourceType(SpotSourceType.TOUR_API)
                .title("경포해수욕장")
                .category("관광지")
                .build());
        long contentId = System.nanoTime();
        TourDataSpotModel saved = tourDataSpotRepository.save(TourDataSpotModel.builder()
                .contentId(contentId)
                .spotId(spot.spotId())
                .title("경포해수욕장")
                .build());

        Optional<TourDataSpotModel> found = tourDataSpotRepository.findBySpotId(spot.spotId());

        assertThat(found).isPresent();
        assertThat(found.get().tourDataSpotId()).isEqualTo(saved.tourDataSpotId());
        assertThat(found.get().contentId()).isEqualTo(contentId);
    }

    @Test
    void 연결된_spot_id가_없으면_빈값을_반환한다() {
        Optional<TourDataSpotModel> found = tourDataSpotRepository.findBySpotId(-1L);

        assertThat(found).isEmpty();
    }

    @Test
    void 소개_수집은_해당_지역의_활성_TourAPI_미수집_스팟만_조회한다() {
        String region = "desc";
        TourDataSpotModel expected = saveDescriptionTarget(region, "830", SpotSourceType.TOUR_API, SpotStatus.ACTIVE, null);
        saveDescriptionTarget(region, "830", SpotSourceType.TOUR_API, SpotStatus.ACTIVE, "기존 소개");
        saveDescriptionTarget(region, "830", SpotSourceType.TOUR_API, SpotStatus.ACTIVE, "");
        saveDescriptionTarget(region, "830", SpotSourceType.TOUR_API, SpotStatus.HIDDEN, null);
        saveDescriptionTarget(region, "830", SpotSourceType.NATIVE, SpotStatus.ACTIVE, null);
        saveDescriptionTarget(region + "x", "830", SpotSourceType.TOUR_API, SpotStatus.ACTIVE, null);
        saveDescriptionTarget(region, "150", SpotSourceType.TOUR_API, SpotStatus.ACTIVE, null);

        assertThat(tourDataSpotRepository.findByRegionAndSigunguAndDescriptionNotCollected(region, "830"))
                .extracting(TourDataSpotModel::contentId).containsExactly(expected.contentId());
    }

    private TourDataSpotModel saveDescriptionTarget(String region, String sigungu, SpotSourceType source,
                                                    SpotStatus status, String description) {
        SpotModel spot = spotRepository.save(SpotModel.builder().sourceType(source).status(status)
                .title("소개 수집 대상").category("레포츠").description(description).build());
        return tourDataSpotRepository.save(TourDataSpotModel.builder().contentId(System.nanoTime())
                .spotId(spot.spotId()).title("소개 수집 대상").reg(region).sigungu(sigungu).build());
    }
}
