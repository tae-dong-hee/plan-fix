package taedonghee.plan_fix.infrastructure.spot;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
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
}
