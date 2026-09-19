package taedonghee.plan_fix.infrastructure.spot;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.application.spot.SpotDetailApplicationService;
import taedonghee.plan_fix.domain.spot.*;
import taedonghee.plan_fix.interfaces.api.spot.SpotDetailResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** 테스트 전용 폐기형 PostgreSQL에서 원자적 저장과 공개 상세 응답까지 검증한다. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class TourDataInfoRepositoryImplTest {

	@Autowired
	private TourDataInfoRepository infos;
	@Autowired
	private TourDataSpotRepository tourSpots;
	@Autowired
	private SpotRepository spots;
	@Autowired
	private SpotDetailApplicationService detailService;

	@Test
	void 추가정보_저장은_기본안내를_보존하며_오래된_기본정보_저장에도_지워지지_않는다() {
		TourDataSpotModel source = source(SpotStatus.ACTIVE, SpotSourceType.TOUR_API, "28");
		TourDataInfoModel staleIntro = infos.save(TourDataInfoModel.builder()
			.tourDataSpotId(source.tourDataSpotId()).contentId(source.contentId()).category("28")
			.tel("033-123-4567").parkInfo("주차 가능").timeInfo("10:00~18:00").build());

		assertThat(infos.fillAdditionalInfoIfMissing(source.tourDataSpotId(), "이용요금\n35,000원")).isTrue();
		staleIntro.updateFromTourApi("28", null, null, "033-123-4567", "주차 가능", "09:00~18:00", null, null);
		infos.save(staleIntro);

		TourDataInfoModel stored = infos.findByContentId(source.contentId()).orElseThrow();
		assertThat(stored.additionalInfo()).isEqualTo("이용요금\n35,000원");
		assertThat(stored.tel()).isEqualTo("033-123-4567");
		assertThat(stored.parkInfo()).isEqualTo("주차 가능");
		assertThat(stored.timeInfo()).isEqualTo("09:00~18:00");
		assertThat(stored.tourDataInfoId()).isEqualTo(staleIntro.tourDataInfoId());

		SpotDetailResponse response = SpotDetailResponse.from(detailService.get(source.spotId(), null));
		assertThat(response.info().additionalInfo()).isEqualTo("이용요금\n35,000원");
		assertThat(response.info().timeInfo()).isEqualTo("09:00~18:00");
	}

	@Test
	void 추가정보가_먼저_생겨도_기본정보_수집은_같은_행을_갱신한다() {
		TourDataSpotModel source = source(SpotStatus.ACTIVE, SpotSourceType.TOUR_API, "28");

		assertThat(infos.fillAdditionalInfoIfMissing(source.tourDataSpotId(), "부대시설\n샤워실")).isTrue();
		TourDataInfoModel additionalOnly = infos.findByContentId(source.contentId()).orElseThrow();
		assertThat(additionalOnly.timeInfo()).isNull();
		assertThat(additionalOnly.tel()).isNull();

		TourDataInfoModel merged = infos.save(TourDataInfoModel.builder()
			.tourDataSpotId(source.tourDataSpotId()).contentId(source.contentId()).category("28")
			.timeInfo("14:00~익일 11:00").build());

		assertThat(merged.tourDataInfoId()).isEqualTo(additionalOnly.tourDataInfoId());
		assertThat(merged.additionalInfo()).isEqualTo("부대시설\n샤워실");
		assertThat(merged.timeInfo()).isEqualTo("14:00~익일 11:00");
	}

	@Test
	void 정상_빈결과를_덮어쓰지_않고_공개_대상과_지원타입만_저장한다() {
		TourDataSpotModel active = source(SpotStatus.ACTIVE, SpotSourceType.TOUR_API, "28");
		TourDataSpotModel hidden = source(SpotStatus.HIDDEN, SpotSourceType.TOUR_API, "28");
		TourDataSpotModel nativeSpot = source(SpotStatus.ACTIVE, SpotSourceType.NATIVE, "28");
		TourDataSpotModel lodging = source(SpotStatus.ACTIVE, SpotSourceType.TOUR_API, "32");

		assertThat(infos.fillAdditionalInfoIfMissing(active.tourDataSpotId(), "")).isTrue();
		assertThat(infos.fillAdditionalInfoIfMissing(active.tourDataSpotId(), "덮어쓰면 안 됨")).isFalse();
		assertThat(infos.fillAdditionalInfoIfMissing(hidden.tourDataSpotId(), "숨김")).isFalse();
		assertThat(infos.fillAdditionalInfoIfMissing(nativeSpot.tourDataSpotId(), "직접등록")).isFalse();
		assertThat(infos.fillAdditionalInfoIfMissing(lodging.tourDataSpotId(), "객실정보")).isFalse();
		assertThat(infos.findByContentId(active.contentId()).orElseThrow().additionalInfo()).isEmpty();
		assertThat(infos.findByContentId(hidden.contentId())).isEmpty();
		assertThat(infos.findByContentId(nativeSpot.contentId())).isEmpty();
		assertThat(infos.findByContentId(lodging.contentId())).isEmpty();
	}

	private TourDataSpotModel source(SpotStatus status, SpotSourceType sourceType, String category) {
		SpotModel canonical = spots.save(SpotModel.builder().title("추가안내 테스트 장소")
			.category("레포츠").sourceType(sourceType).status(status).build());
		return tourSpots.save(TourDataSpotModel.builder().spotId(canonical.spotId())
			.contentId(System.nanoTime()).title("추가안내 테스트 장소").category(category).build());
	}

	@Test
	void 같은_contentid가_다른_원본을_가리키면_추가정보를_덮어쓰지_않는다() {
		TourDataSpotModel first = source(SpotStatus.ACTIVE, SpotSourceType.TOUR_API, "28");
		TourDataSpotModel second = source(SpotStatus.ACTIVE, SpotSourceType.TOUR_API, "28");
		infos.save(TourDataInfoModel.builder().tourDataSpotId(first.tourDataSpotId())
			.contentId(second.contentId()).category("28").tel("기존 안내").build());

		assertThat(infos.fillAdditionalInfoIfMissing(second.tourDataSpotId(), "다른 원본 안내")).isFalse();
		TourDataInfoModel stored = infos.findByContentId(second.contentId()).orElseThrow();
		assertThat(stored.tourDataSpotId()).isEqualTo(first.tourDataSpotId());
		assertThat(stored.additionalInfo()).isNull();
		assertThat(stored.tel()).isEqualTo("기존 안내");
	}
}
