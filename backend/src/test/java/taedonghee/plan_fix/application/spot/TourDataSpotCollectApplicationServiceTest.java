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
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;

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
	private static final int RESTAURANT = 39;

	@MockitoBean
	private TourApiClient tourApiClient;

	@Autowired
	private TourDataSpotCollectApplicationService service;

	@Autowired
	private SpotRepository spotRepository;

	@Autowired
	private TourDataSpotRepository tourDataSpotRepository;

	@Autowired
	private TourApiProperties props;

	private long contentId;

	@BeforeEach
	void setUp() {
		contentId = System.nanoTime();
		// 테스트에서 지정한 타입 외에는 응답을 비워 외부 API 호출 없이 수집한다.
		when(tourApiClient.fetchTotalCount(anyString(), anyString(), anyInt())).thenReturn(0);
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
	void 카페를_신규_수집하면_원본_분류는_보존하고_spots는_카페_음료로_저장한다() {
		givenPage(item(RESTAURANT, "FD050100", "강릉 카페", "128.8987999", "37.8127061"));

		TourDataSpotCollectApplicationService.CollectResult result = service.collect(REGN, SIGNGU);

		TourDataSpotModel source = tourDataSpotRepository.findByContentId(contentId).orElseThrow();
		SpotModel spot = collectedSpot();
		assertThat(result.createdCount()).isEqualTo(1);
		assertThat(result.updatedCount()).isZero();
		assertThat(source.category()).isEqualTo("39");
		assertThat(source.lcls()).isEqualTo("FD050100");
		assertThat(spot.category()).isEqualTo("카페/음료");
		assertThat(spot.sourceType()).isEqualTo(SpotSourceType.TOUR_API);
		assertThat(spot.status()).isEqualTo(SpotStatus.ACTIVE);
	}

	@Test
	void 음식점으로_남은_카페를_재수집하면_기존_ID와_좋아요_노출_상태를_보존하며_분류를_수정한다() {
		givenPage(item(RESTAURANT, "FD050100", "강릉 카페", "128.8987999", "37.8127061"));
		service.collect(REGN, SIGNGU);

		SpotModel before = collectedSpot();
		// 소분류는 수집됐지만 canonical 카테고리는 음식점으로 남아 있는 과거 데이터를 재현한다.
		spotRepository.save(SpotModel.builder()
			.spotId(before.spotId())
			.sourceType(before.sourceType())
			.attributes(attributesOf(before, "음식점"))
			.likeCount(99L)
			.viewCount(500L)
			.status(SpotStatus.HIDDEN)
			.createdAt(before.createdAt())
			.build());
		assertThat(collectedSpot().category()).isEqualTo("음식점");

		TourDataSpotCollectApplicationService.CollectResult result = service.collect(REGN, SIGNGU);

		SpotModel after = collectedSpot();
		assertThat(result.createdCount()).isZero();
		assertThat(result.updatedCount()).isEqualTo(1);
		assertThat(after.spotId()).isEqualTo(before.spotId());
		assertThat(after.category()).isEqualTo("카페/음료");
		assertThat(after.likeCount()).isEqualTo(99L);
		assertThat(after.viewCount()).isEqualTo(500L);
		assertThat(after.status()).isEqualTo(SpotStatus.HIDDEN);
		assertThat(after.createdAt()).isEqualTo(before.createdAt());
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

	@Test
	void 빈_원본사진을_재수집해도_검수된_대표사진은_spots에만_보존한다() {
		AreaBasedListItem original = item("검수된 해변", "128.8987999", "37.8127061");
		givenPage(original);
		service.collect(REGN, SIGNGU);
		SpotModel before = collectedSpot();
		String verifiedUrl = "/images/verified-spots/test-beach.webp";
		var catalog = new VerifiedSpotPhotoCatalog(List.of(new VerifiedSpotPhotoCatalog.Photo(
			before.spotId(), before.title(), before.address(), before.latitude(), before.longitude(), verifiedUrl)));
		var verifiedService = new TourDataSpotCollectApplicationService(tourApiClient, props,
			spotRepository, tourDataSpotRepository, catalog);
		givenPage(new AreaBasedListItem(original.contentid(), original.contenttypeid(), original.title(),
			original.addr1(), original.mapx(), original.mapy(), null, original.createdtime(), original.zipcode(),
			original.lDongRegnCd(), original.lDongSignguCd(), original.lclsSystm3()));

		verifiedService.collect(REGN, SIGNGU);

		assertThat(collectedSpot().thumbnail()).isEqualTo(verifiedUrl);
		assertThat(tourDataSpotRepository.findByContentId(contentId).orElseThrow().thumbnail()).isNull();
	}

	private void givenPage(AreaBasedListItem item) {
		int contentTypeId = Integer.parseInt(item.contenttypeid());
		when(tourApiClient.fetchTotalCount(anyString(), anyString(), eq(contentTypeId))).thenReturn(1);
		when(tourApiClient.fetchPage(anyString(), anyString(), eq(contentTypeId), anyInt()))
			.thenReturn(List.of(item));
	}

	private SpotModel collectedSpot() {
		TourDataSpotModel tourDataSpot = tourDataSpotRepository.findByContentId(contentId).orElseThrow();
		return spotRepository.findById(tourDataSpot.spotId()).orElseThrow();
	}

	private SpotModel.SourceAttributes attributesOf(SpotModel spot) {
		return attributesOf(spot, spot.category());
	}

	private SpotModel.SourceAttributes attributesOf(SpotModel spot, String category) {
		return new SpotModel.SourceAttributes(spot.title(), category, spot.region(), spot.sigungu(),
			spot.address(), spot.latitude(), spot.longitude(), spot.thumbnail(), spot.description());
	}

	private AreaBasedListItem item(String title, String mapx, String mapy) {
		return item(ATTRACTION, "AC01", title, mapx, mapy);
	}

	private AreaBasedListItem item(int contentTypeId, String lcls, String title, String mapx, String mapy) {
		return new AreaBasedListItem(String.valueOf(contentId), String.valueOf(contentTypeId), title,
			"강원특별자치도 강릉시", mapx, mapy, "thumb.jpg", "20240101000000", "25400", REGN, SIGNGU, lcls);
	}
}
