package taedonghee.plan_fix.interfaces.api.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.WebAsyncTask;
import taedonghee.plan_fix.application.spot.TourDataDescriptionCollectApplicationService;
import taedonghee.plan_fix.application.spot.TourDataAdditionalInfoCollectApplicationService;
import taedonghee.plan_fix.application.spot.TourDataImageCollectApplicationService;
import taedonghee.plan_fix.application.spot.TourDataInfoCollectApplicationService;
import taedonghee.plan_fix.application.spot.TourDataSpotCollectApplicationService;

/**
 * [interfaces] 관광데이터 수집용 관리자 API.
 * 컨트롤러는 HTTP 변환만 담당하고, 처리는 application에 위임한다.
 */
@RestController
@RequestMapping("/api/v1/admin/spots")
@RequiredArgsConstructor
public class SpotAdminController {

	private static final long COLLECT_TIMEOUT_MS = 1_800_000L;

	private final TourDataSpotCollectApplicationService tourDataSpotCollectApplicationService;
	private final TourDataImageCollectApplicationService tourDataImageCollectApplicationService;
	private final TourDataInfoCollectApplicationService tourDataInfoCollectApplicationService;
	private final TourDataDescriptionCollectApplicationService tourDataDescriptionCollectApplicationService;
	private final TourDataAdditionalInfoCollectApplicationService tourDataAdditionalInfoCollectApplicationService;

	/** 예: POST /api/v1/admin/spots/collect?lDongRegnCd=51&lDongSignguCd=150 (강원 강릉) */
	@PostMapping("/collect")
	public WebAsyncTask<TourDataSpotCollectApplicationService.CollectResult> collect(
		@RequestParam String lDongRegnCd,
		@RequestParam String lDongSignguCd
	) {
		return new WebAsyncTask<>(
			COLLECT_TIMEOUT_MS,
			() -> tourDataSpotCollectApplicationService.collect(lDongRegnCd, lDongSignguCd)
		);
	}

	/**
	 * 수집된 스팟들의 이미지를 detailImage2로 채운다. contentId로 연동되므로 collect 이후에 호출해야 한다.
	 * 시군구코드는 시도코드 안에서만 유일하므로 lDongRegnCd를 함께 받는다.
	 * 예: POST /api/v1/admin/spots/collect-images?lDongRegnCd=51&lDongSignguCd=150
	 */
	@PostMapping("/collect-images")
	public WebAsyncTask<TourDataImageCollectApplicationService.CollectImageResult> collectImages(
		@RequestParam String lDongRegnCd,
		@RequestParam String lDongSignguCd
	) {
		return new WebAsyncTask<>(
			COLLECT_TIMEOUT_MS,
			() -> tourDataImageCollectApplicationService.collect(lDongRegnCd, lDongSignguCd)
		);
	}

	/**
	 * 수집된 스팟들의 상세 정보를 detailIntro2로 채운다.
	 * contentId와 category를 저장된 스팟에서 가져오므로 collect 이후에 호출해야 한다.
	 * 시군구코드는 시도코드 안에서만 유일하므로 lDongRegnCd를 함께 받는다.
	 * 예: POST /api/v1/admin/spots/collect-info?lDongRegnCd=51&lDongSignguCd=150
	 */
	@PostMapping("/collect-info")
	public WebAsyncTask<TourDataInfoCollectApplicationService.CollectInfoResult> collectInfo(
		@RequestParam String lDongRegnCd,
		@RequestParam String lDongSignguCd
	) {
		return new WebAsyncTask<>(
			COLLECT_TIMEOUT_MS,
			() -> tourDataInfoCollectApplicationService.collect(lDongRegnCd, lDongSignguCd)
		);
	}

	/** detailCommon2로 아직 수집하지 않은 장소 소개를 채운다. 정상적인 빈 결과도 재수집하지 않는다. */
	@PostMapping("/collect-descriptions")
	public WebAsyncTask<TourDataDescriptionCollectApplicationService.CollectDescriptionResult> collectDescriptions(
		@RequestParam String lDongRegnCd,
		@RequestParam String lDongSignguCd
	) {
		return new WebAsyncTask<>(
			COLLECT_TIMEOUT_MS,
			() -> tourDataDescriptionCollectApplicationService.collect(lDongRegnCd, lDongSignguCd)
		);
	}

	/** detailInfo2로 시설·요금 등 아직 수집하지 않은 추가 이용안내를 채운다. */
	@PostMapping("/collect-additional-info")
	public WebAsyncTask<TourDataAdditionalInfoCollectApplicationService.CollectAdditionalInfoResult> collectAdditionalInfo(
		@RequestParam String lDongRegnCd,
		@RequestParam String lDongSignguCd
	) {
		return new WebAsyncTask<>(
			COLLECT_TIMEOUT_MS,
			() -> tourDataAdditionalInfoCollectApplicationService.collect(lDongRegnCd, lDongSignguCd)
		);
	}
}
