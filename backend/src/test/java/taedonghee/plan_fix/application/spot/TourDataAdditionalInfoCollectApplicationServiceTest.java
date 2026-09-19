package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.spot.*;
import taedonghee.plan_fix.infrastructure.spot.DetailInfoItem;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;
import taedonghee.plan_fix.infrastructure.spot.TourApiQuotaExceededException;
import taedonghee.plan_fix.infrastructure.spot.TourApiResponseException;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TourDataAdditionalInfoCollectApplicationServiceTest {

	private final TourApiClient client = mock(TourApiClient.class);
	private final TourDataSpotRepository tourSpots = mock(TourDataSpotRepository.class);
	private final SpotRepository spots = mock(SpotRepository.class);
	private final TourDataInfoRepository infos = mock(TourDataInfoRepository.class);
	private final TourDataAdditionalInfoCollectApplicationService service = new TourDataAdditionalInfoCollectApplicationService(
		client, new TourApiProperties("http://unused", "test-key", "ETC", "test", 10, 0, 1000, 1000),
		tourSpots, spots, infos);

	@Test
	void 기본안내가_없는_캠핑장에도_추가_요금과_시설을_별도로_저장한다() {
		givenActiveTargets(1L);
		when(client.fetchDetailInfo(101L, "28")).thenReturn(List.of(
			new DetailInfoItem("101", "28", "이용요금", "캠핑 35,000원~45,000원<br>※변동 문의"),
			new DetailInfoItem("101", "28", "부대시설", "샤워실")));

		var result = service.collect("51", "830");

		verify(infos).fillAdditionalInfoIfMissing(1L, "이용요금\n캠핑 35,000원~45,000원<br>※변동 문의\n\n부대시설\n샤워실");
		verify(infos, never()).save(any());
		assertThat(result.updatedCount()).isEqualTo(1);
		assertThat(result.failCount()).isZero();
	}

	@Test
	void 비공개_직접등록_다른응답구조_수집완료_장소는_호출하지_않는다() {
		List<TourDataSpotModel> sources = List.of(
			source(1L, "28"), source(2L, "28"), source(3L, "28"), source(4L, "32"),
			source(5L, "25"), source(6L, "28"), source(7L, "28"));
		when(tourSpots.findByRegionAndSigungu("51", "830")).thenReturn(sources);
		when(spots.findAllByIdIn(anyCollection())).thenReturn(List.of(
			canonical(1L, SpotStatus.ACTIVE, SpotSourceType.TOUR_API),
			canonical(2L, SpotStatus.HIDDEN, SpotSourceType.TOUR_API),
			canonical(3L, SpotStatus.ACTIVE, SpotSourceType.NATIVE),
			canonical(4L, SpotStatus.ACTIVE, SpotSourceType.TOUR_API),
			canonical(5L, SpotStatus.ACTIVE, SpotSourceType.TOUR_API),
			canonical(6L, SpotStatus.ACTIVE, SpotSourceType.TOUR_API),
			canonical(7L, SpotStatus.ACTIVE, SpotSourceType.TOUR_API)));
		when(infos.findByContentId(106L)).thenReturn(Optional.of(info(6L, "")));
		when(infos.findByContentId(107L)).thenReturn(Optional.of(info(7L, "기존 안내")));
		when(infos.fillAdditionalInfoIfMissing(1L, "")).thenReturn(true);

		var result = service.collect("51", "830");

		verify(client).fetchDetailInfo(101L, "28");
		verifyNoMoreInteractions(client);
		assertThat(result.targetSpotCount()).isEqualTo(1);
		assertThat(result.emptyCount()).isEqualTo(1);
	}

	@Test
	void 정상_빈결과는_빈문자열로_완료하고_실패는_다음_실행에_재시도한다() {
		givenActiveTargets(1L, 2L);
		when(client.fetchDetailInfo(102L, "28"))
			.thenThrow(new TourApiResponseException("detailInfo2", "30", "SERVICE_ERROR"));

		var result = service.collect("51", "830");

		verify(infos).fillAdditionalInfoIfMissing(1L, "");
		verify(infos, never()).fillAdditionalInfoIfMissing(eq(2L), anyString());
		assertThat(result.emptyCount()).isEqualTo(1);
		assertThat(result.failCount()).isEqualTo(1);
		assertThat(result.remainingCount()).isZero();
	}

	@Test
	void 한도초과는_남은_요청을_중단한다() {
		givenActiveTargets(1L, 2L, 3L);
		when(client.fetchDetailInfo(102L, "28")).thenThrow(new TourApiQuotaExceededException("test quota"));

		var result = service.collect("51", "830");

		verify(client, never()).fetchDetailInfo(103L, "28");
		assertThat(result.processedCount()).isEqualTo(1);
		assertThat(result.remainingCount()).isEqualTo(2);
		assertThat(result.quotaExceeded()).isTrue();
	}

	@Test
	void 동시_수집_또는_숨김변경으로_저장되지_않은_건은_건너뛴다() {
		givenActiveTargets(1L);
		when(infos.fillAdditionalInfoIfMissing(1L, "")).thenReturn(false);

		var result = service.collect("51", "830");

		assertThat(result.skippedCount()).isEqualTo(1);
		assertThat(result.emptyCount()).isZero();
	}

	private void givenActiveTargets(Long... ids) {
		when(tourSpots.findByRegionAndSigungu("51", "830"))
			.thenReturn(List.of(ids).stream().map(id -> source(id, "28")).toList());
		when(spots.findAllByIdIn(anyCollection())).thenReturn(List.of(ids).stream()
			.map(id -> canonical(id, SpotStatus.ACTIVE, SpotSourceType.TOUR_API)).toList());
		when(infos.fillAdditionalInfoIfMissing(anyLong(), anyString())).thenReturn(true);
	}

	private TourDataSpotModel source(long id, String category) {
		return TourDataSpotModel.builder().tourDataSpotId(id).spotId(id).contentId(id + 100)
			.title("테스트 장소").category(category).build();
	}

	private SpotModel canonical(long id, SpotStatus status, SpotSourceType sourceType) {
		return SpotModel.builder().spotId(id).title("테스트 장소").category("레포츠")
			.status(status).sourceType(sourceType).build();
	}

	private TourDataInfoModel info(long id, String additionalInfo) {
		return TourDataInfoModel.builder().tourDataSpotId(id).contentId(id + 100)
			.additionalInfo(additionalInfo).build();
	}
}
