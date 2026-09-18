package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.TourDataImageModel;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 수집 서비스는 외부 API 호출 때문에 트랜잭션을 열지 않은 채 저장을 호출한다.
 * 이 테스트도 @Transactional을 붙이지 않아 그 상황을 그대로 재현한다.
 * (붙이면 테스트가 트랜잭션을 대신 열어줘서 정작 검증하려는 문제가 가려진다.)
 */
@SpringBootTest
@ActiveProfiles("test")
class TourDataImagePersisterTest {

	@Autowired
	private TourDataImagePersister tourDataImagePersister;

	@Autowired
	private TourDataSpotRepository tourDataSpotRepository;

	@Autowired
	private TourDataImageRepository tourDataImageRepository;

	@Autowired
	private SpotRepository spotRepository;

	@Test
	void 트랜잭션_밖에서_호출해도_기존_이미지를_지우고_새로_저장한다() {
		long contentId = System.nanoTime();
		SpotModel savedSpot = spotRepository.save(SpotModel.builder()
			.sourceType(SpotSourceType.TOUR_API)
			.title("테스트 스팟")
			.category("관광지")
			.build());
		TourDataSpotModel spot = tourDataSpotRepository.save(TourDataSpotModel.builder()
			.contentId(contentId)
			.spotId(savedSpot.spotId())
			.title("테스트 스팟")
			.reg("51")
			.sigungu("150")
			.build());

		tourDataImagePersister.replaceImages(spot, List.of(image(spot, contentId, "old.jpg")));
		assertThat(tourDataImageRepository.findByTourDataSpotId(spot.tourDataSpotId()))
			.extracting(TourDataImageModel::originalImage)
			.containsExactly("old.jpg");

		// 재수집: derived delete가 트랜잭션 없이 호출되던 지점이다
		tourDataImagePersister.replaceImages(spot, List.of(image(spot, contentId, "new.jpg")));

		assertThat(tourDataImageRepository.findByTourDataSpotId(spot.tourDataSpotId()))
			.extracting(TourDataImageModel::originalImage)
			.containsExactly("new.jpg");
		assertThat(tourDataSpotRepository.findByContentId(contentId))
			.get()
			.extracting(TourDataSpotModel::imageCollectedAt)
			.isNotNull();
	}

	private TourDataImageModel image(TourDataSpotModel spot, long contentId, String originalImage) {
		return TourDataImageModel.builder()
			.tourDataSpotId(spot.tourDataSpotId())
			.contentId(contentId)
			.originalImage(originalImage)
			.build();
	}
}
