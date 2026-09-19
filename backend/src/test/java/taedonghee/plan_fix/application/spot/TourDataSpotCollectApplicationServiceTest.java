package taedonghee.plan_fix.application.spot;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.infrastructure.spot.AreaBasedListItem;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 수집이 canonical 스팟(spots)에 제대로 반영되는지 본다.
 * 외부 API만 대체하고 임시 PostgreSQL에 저장해 좌표 변환과 값 보존을 확인한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class TourDataSpotCollectApplicationServiceTest {

	private static final String REGN = "51";
	private static final String SIGNGU = "150";
	private static final int ATTRACTION = 12;

	@MockitoBean
	private TourApiClient tourApiClient;

	@Autowired
	private TourDataSpotCollectApplicationService service;

	@Autowired
	private SpotRepository spotRepository;

	@Autowired
	private TourDataSpotRepository tourDataSpotRepository;

	private long contentId;

	@BeforeEach
	void setUp() {
		contentId = System.nanoTime();
		// 관광지(12)만 1건 응답하고 나머지 타입은 0건으로 둔다
		when(tourApiClient.fetchTotalCount(anyString(), anyString(), anyInt())).thenReturn(0);
		when(tourApiClient.fetchTotalCount(anyString(), anyString(), eq(ATTRACTION))).thenReturn(1);
	}

	@Test
	void 신규_수집이면_spots가_생성되고_좌표는_교차_매핑된다() {
		givenPage(item("경포해수욕장", "128.8987999", "37.8127061"));

		service.collect(REGN, SIGNGU);

		SpotModel spot = collectedSpot();
		assertThat(spot.title()).isEqualTo("경포해수욕장");
		assertThat(spot.category()).isEqualTo("관광지");
		assertThat(spot.sourceType()).isEqualTo(SpotSourceType.TOUR_API);
		assertThat(spot.status()).isEqualTo(SpotStatus.ACTIVE);
		// TourAPI는 mapx=경도, mapy=위도라 뒤집어 담아야 한다
		assertThat(spot.latitude()).isEqualByComparingTo("37.8127061");
		assertThat(spot.longitude()).isEqualByComparingTo("128.8987999");
	}

	@Test
	void 재수집해도_좋아요_수와_노출_상태는_보존된다() {
		givenPage(item("경포해수욕장", "128.8987999", "37.8127061"));
		service.collect(REGN, SIGNGU);

		SpotModel before = collectedSpot();
		spotRepository.save(SpotModel.builder()
			.spotId(before.spotId())
			.sourceType(before.sourceType())
			.attributes(attributesOf(before))
			.likeCount(99L)
			.viewCount(500L)
			.status(SpotStatus.HIDDEN)
			.createdAt(before.createdAt())
			.build());

		givenPage(item("경포해수욕장(변경됨)", "128.8987999", "37.8127061"));
		service.collect(REGN, SIGNGU);

		SpotModel after = collectedSpot();
		assertThat(after.title()).isEqualTo("경포해수욕장(변경됨)");
		assertThat(after.likeCount()).isEqualTo(99L);
		assertThat(after.viewCount()).isEqualTo(500L);
		assertThat(after.status()).isEqualTo(SpotStatus.HIDDEN);
	}

	@Test
	void 직접등록으로_바뀐_스팟은_재수집이_덮어쓰지_않는다() {
		givenPage(item("원래 제목", "128.8987999", "37.8127061"));
		service.collect(REGN, SIGNGU);

		SpotModel before = collectedSpot();
		spotRepository.save(SpotModel.builder()
			.spotId(before.spotId())
			.sourceType(SpotSourceType.NATIVE)
			.attributes(attributesOf(before))
			.createdAt(before.createdAt())
			.build());

		givenPage(item("TourAPI가 덮어쓴 제목", "128.8987999", "37.8127061"));
		service.collect(REGN, SIGNGU);

		assertThat(collectedSpot().title()).isEqualTo("원래 제목");
	}

	@Test
	void 목록을_재수집해도_공통정보_API에서_수집한_소개는_보존한다() {
		givenPage(item("경포해수욕장", "128.8987999", "37.8127061"));
		service.collect(REGN, SIGNGU);
		SpotModel before = collectedSpot();
		spotRepository.fillTourApiDescriptionIfMissing(before.spotId(), "바다를 따라 산책할 수 있는 해변입니다.");

		givenPage(item("변경된 제목", "128.8987999", "37.8127061"));
		service.collect(REGN, SIGNGU);

		assertThat(collectedSpot().title()).isEqualTo("변경된 제목");
		assertThat(collectedSpot().description()).isEqualTo("바다를 따라 산책할 수 있는 해변입니다.");
	}

	@Test
	void 목록을_재수집해도_소개가_없다는_정상_수집_결과를_보존한다() {
		givenPage(item("경포해수욕장", "128.8987999", "37.8127061"));
		service.collect(REGN, SIGNGU);
		spotRepository.fillTourApiDescriptionIfMissing(collectedSpot().spotId(), "");

		service.collect(REGN, SIGNGU);

		assertThat(collectedSpot().description()).isEmpty();
	}

	private void givenPage(AreaBasedListItem item) {
		when(tourApiClient.fetchPage(anyString(), anyString(), eq(ATTRACTION), anyInt()))
			.thenReturn(List.of(item));
	}

	private SpotModel collectedSpot() {
		TourDataSpotModel tourDataSpot = tourDataSpotRepository.findByContentId(contentId).orElseThrow();
		return spotRepository.findById(tourDataSpot.spotId()).orElseThrow();
	}

	private SpotModel.SourceAttributes attributesOf(SpotModel spot) {
		return new SpotModel.SourceAttributes(spot.title(), spot.category(), spot.region(), spot.sigungu(),
			spot.address(), spot.latitude(), spot.longitude(), spot.thumbnail(), spot.description());
	}

	private AreaBasedListItem item(String title, String mapx, String mapy) {
		return new AreaBasedListItem(String.valueOf(contentId), String.valueOf(ATTRACTION), title,
			"강원특별자치도 강릉시", mapx, mapy, "thumb.jpg", "20240101000000", "25400", REGN, SIGNGU, "AC01");
	}
}
