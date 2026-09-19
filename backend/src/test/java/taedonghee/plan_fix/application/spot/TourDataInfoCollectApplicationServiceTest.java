package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import taedonghee.plan_fix.domain.spot.TourDataInfoModel;
import taedonghee.plan_fix.domain.spot.TourDataInfoRepository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.infrastructure.spot.DetailIntroItem;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TourDataInfoCollectApplicationServiceTest {

	private final TourApiClient tourApiClient = mock(TourApiClient.class);
	private final TourApiProperties props = mock(TourApiProperties.class);
	private final TourDataSpotRepository spotRepository = mock(TourDataSpotRepository.class);
	private final TourDataInfoRepository infoRepository = mock(TourDataInfoRepository.class);
	private final TourDataInfoCollectApplicationService service = new TourDataInfoCollectApplicationService(
		tourApiClient, props, spotRepository, infoRepository);

	@Test
	void 축제_이용시간에는_요금이_아닌_공연시간을_저장한다() {
		TourDataSpotModel spot = spot("15");
		DetailIntroItem item = JsonMapper.builder().build().readValue("""
			{"contentid":"100","contenttypeid":"15","usetimefestival":"무료","playtime":"18:00~21:00"}
			""", DetailIntroItem.class);
		when(tourApiClient.fetchDetailIntro(100L, "15")).thenReturn(item);

		TourDataInfoCollectApplicationService.CollectInfoResult result = service.collect("51", "150");

		ArgumentCaptor<TourDataInfoModel> saved = ArgumentCaptor.forClass(TourDataInfoModel.class);
		verify(infoRepository).save(saved.capture());
		assertThat(saved.getValue().timeInfo()).isEqualTo("18:00~21:00");
		assertThat(result.createdCount()).isEqualTo(1);
		assertThat(spot.infoCollectedAt()).isNotNull();
	}

	@Test
	void 축제_공연시간이_없어도_요금으로_대체하지_않는다() {
		spot("15");
		DetailIntroItem item = JsonMapper.builder().build().readValue("""
			{"contentid":"100","contenttypeid":"15","usetimefestival":"1인 10,000원"}
			""", DetailIntroItem.class);
		when(tourApiClient.fetchDetailIntro(100L, "15")).thenReturn(item);

		service.collect("51", "150");

		ArgumentCaptor<TourDataInfoModel> saved = ArgumentCaptor.forClass(TourDataInfoModel.class);
		verify(infoRepository).save(saved.capture());
		assertThat(saved.getValue().timeInfo()).isNull();
	}

	@Test
	void 캠핑장_소개정보가_없으면_이용안내를_생성하지_않는다() {
		TourDataSpotModel spot = spot("28");
		when(tourApiClient.fetchDetailIntro(100L, "28")).thenReturn(null);

		TourDataInfoCollectApplicationService.CollectInfoResult result = service.collect("51", "150");

		verify(infoRepository, never()).save(any());
		assertThat(result.emptyCount()).isEqualTo(1);
		assertThat(result.failCount()).isZero();
		assertThat(spot.infoCollectedAt()).isNotNull();
	}

	private TourDataSpotModel spot(String category) {
		TourDataSpotModel spot = TourDataSpotModel.builder()
			.tourDataSpotId(1L)
			.contentId(100L)
			.title("이용안내 테스트 장소")
			.category(category)
			.reg("51")
			.sigungu("150")
			.build();
		when(spotRepository.findByRegionAndSigunguAndInfoNotCollected("51", "150"))
			.thenReturn(List.of(spot));
		when(props.callIntervalMs()).thenReturn(0L);
		return spot;
	}
}
