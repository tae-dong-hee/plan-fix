package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.infrastructure.spot.DetailCommonItem;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;
import taedonghee.plan_fix.infrastructure.spot.TourApiQuotaExceededException;
import taedonghee.plan_fix.infrastructure.spot.TourApiResponseException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class TourDataDescriptionCollectApplicationServiceTest {

	private final TourApiClient client = mock(TourApiClient.class);
	private final TourDataSpotRepository tourSpots = mock(TourDataSpotRepository.class);
	private final SpotRepository spots = mock(SpotRepository.class);
	private final TourDataDescriptionCollectApplicationService service = new TourDataDescriptionCollectApplicationService(
		client, new TourApiProperties("http://unused", "test-key", "ETC", "test", 10, 0, 1000, 1000), tourSpots, spots);

	@BeforeEach
	void setUp() {
		when(spots.fillTourApiDescriptionIfMissing(anyLong(), anyString())).thenReturn(true);
	}

	@Test
	void 수집한_소개는_다른_스팟_필드_저장_없이_조건부_업데이트한다() {
		givenTargets(1L);
		when(client.fetchDetailCommon(101L)).thenReturn(new DetailCommonItem("101", "28", "  계곡 옆 캠핑장입니다.<br>예약 가능  "));

		var result = service.collect("51", "830");

		verify(spots).fillTourApiDescriptionIfMissing(1L, "계곡 옆 캠핑장입니다.<br>예약 가능");
		verify(spots, never()).save(any());
		assertThat(result.updatedCount()).isEqualTo(1);
		assertThat(result.processedCount()).isEqualTo(1);
		assertThat(result.failCount()).isZero();
	}

	@Test
	void 정상적인_빈_응답과_공백_소개는_빈문자열로_수집완료를_기록한다() {
		givenTargets(1L, 2L);
		when(client.fetchDetailCommon(102L)).thenReturn(new DetailCommonItem("102", "28", " \n "));

		var result = service.collect("51", "830");

		verify(spots).fillTourApiDescriptionIfMissing(1L, "");
		verify(spots).fillTourApiDescriptionIfMissing(2L, "");
		assertThat(result.emptyCount()).isEqualTo(2);
		assertThat(result.updatedCount()).isZero();
		assertThat(result.failCount()).isZero();
	}

	@Test
	void 실패한_소개는_미수집으로_남기고_다음_스팟을_수집한다() {
		givenTargets(1L, 2L);
		when(client.fetchDetailCommon(101L)).thenThrow(new TourApiResponseException("detailCommon2", "30", "SERVICE_ERROR"));
		when(client.fetchDetailCommon(102L)).thenReturn(new DetailCommonItem("102", "12", "산책로"));

		var result = service.collect("51", "830");

		verify(spots, never()).fillTourApiDescriptionIfMissing(eq(1L), anyString());
		verify(spots).fillTourApiDescriptionIfMissing(2L, "산책로");
		assertThat(result.failCount()).isEqualTo(1);
		assertThat(result.updatedCount()).isEqualTo(1);
		assertThat(result.remainingCount()).isZero();
	}

	@Test
	void 한도가_초과되면_그_이후_API_호출과_저장을_중단한다() {
		givenTargets(1L, 2L, 3L);
		when(client.fetchDetailCommon(101L)).thenReturn(new DetailCommonItem("101", "12", "산책로"));
		when(client.fetchDetailCommon(102L)).thenThrow(new TourApiQuotaExceededException("test quota"));

		var result = service.collect("51", "830");

		verify(client, never()).fetchDetailCommon(103L);
		verify(spots, never()).fillTourApiDescriptionIfMissing(eq(2L), anyString());
		assertThat(result.processedCount()).isEqualTo(1);
		assertThat(result.quotaExceeded()).isTrue();
		assertThat(result.remainingCount()).isEqualTo(2);
		assertThat(result.failCount()).isZero();
	}

	@Test
	void API_호출_도중_이미_수정된_스팟은_덮어쓰지_않고_건너뛴다() {
		givenTargets(1L);
		when(client.fetchDetailCommon(101L)).thenReturn(new DetailCommonItem("101", "12", "산책로"));
		when(spots.fillTourApiDescriptionIfMissing(1L, "산책로")).thenReturn(false);

		var result = service.collect("51", "830");

		assertThat(result.skippedCount()).isEqualTo(1);
		assertThat(result.updatedCount()).isZero();
		assertThat(result.emptyCount()).isZero();
	}

	@Test
	void 미수집_대상이_없으면_API를_호출하지_않는다() {
		givenTargets();

		var result = service.collect("51", "830");

		verifyNoInteractions(client);
		assertThat(result.targetSpotCount()).isZero();
	}

	private void givenTargets(Long... ids) {
		when(tourSpots.findByRegionAndSigunguAndDescriptionNotCollected("51", "830"))
			.thenReturn(List.of(ids).stream().map(id -> TourDataSpotModel.builder()
				.spotId(id).contentId(id + 100).title("스팟 " + id).build()).toList());
	}
}
