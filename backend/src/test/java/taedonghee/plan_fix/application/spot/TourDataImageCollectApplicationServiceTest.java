package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;
import taedonghee.plan_fix.infrastructure.spot.TourApiResponseException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TourDataImageCollectApplicationServiceTest {

	@Test
	void API_오류_응답은_완료_처리하지_않아_다음_수집에서_재시도한다() {
		TourApiClient tourApiClient = mock(TourApiClient.class);
		TourApiProperties props = mock(TourApiProperties.class);
		TourDataSpotRepository spotRepository = mock(TourDataSpotRepository.class);
		TourDataImagePersister imagePersister = mock(TourDataImagePersister.class);
		TourDataSpotModel spot = TourDataSpotModel.builder()
			.contentId(100L)
			.title("오류 응답 테스트 스팟")
			.reg("51")
			.sigungu("150")
			.build();

		when(spotRepository.findByRegionAndSigunguAndImageNotCollected(anyString(), anyString()))
			.thenReturn(List.of(spot));
		when(props.callIntervalMs()).thenReturn(0L);
		when(tourApiClient.fetchDetailImages(100L))
			.thenThrow(new TourApiResponseException("detailImage2", "30", "SERVICE_ERROR"));

		TourDataImageCollectApplicationService service = new TourDataImageCollectApplicationService(
			tourApiClient, props, spotRepository, imagePersister);

		TourDataImageCollectApplicationService.CollectImageResult first = service.collect("51", "150");
		TourDataImageCollectApplicationService.CollectImageResult second = service.collect("51", "150");

		assertThat(first.processedCount()).isZero();
		assertThat(first.failCount()).isEqualTo(1);
		assertThat(spot.imageCollectedAt()).isNull();
		assertThat(second.targetSpotCount()).isEqualTo(1);
		verify(tourApiClient, org.mockito.Mockito.times(2)).fetchDetailImages(100L);
		verify(imagePersister, never()).replaceImages(any(), any());
	}
}
