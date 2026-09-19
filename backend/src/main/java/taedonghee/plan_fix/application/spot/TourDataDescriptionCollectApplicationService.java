package taedonghee.plan_fix.application.spot;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.infrastructure.spot.DetailCommonItem;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;
import taedonghee.plan_fix.infrastructure.spot.TourApiQuotaExceededException;

import java.util.List;

/** detailCommon2의 overview를 활성 TourAPI 스팟의 소개에 채운다. */
@Slf4j
@Service
@RequiredArgsConstructor
public class TourDataDescriptionCollectApplicationService {

	private final TourApiClient tourApiClient;
	private final TourApiProperties props;
	private final TourDataSpotRepository tourDataSpotRepository;
	private final SpotRepository spotRepository;

	/**
	 * 외부 호출을 DB 트랜잭션으로 묶지 않고 소개 한 건만 조건부 커밋한다.
	 * description NULL은 미수집, 빈 문자열은 정상 응답에 소개가 없었던 경우다.
	 * 실패는 NULL로 남겨 재시도하며, 이미 수집한 빈 결과와 기존 소개는 재호출하지 않는다.
	 */
	public CollectDescriptionResult collect(String lDongRegnCd, String lDongSignguCd) {
		List<TourDataSpotModel> spots = tourDataSpotRepository
			.findByRegionAndSigunguAndDescriptionNotCollected(lDongRegnCd, lDongSignguCd);
		int updated = 0;
		int empty = 0;
		int skipped = 0;
		int failed = 0;
		boolean quotaExceeded = false;

		for (int index = 0; index < spots.size(); index++) {
			if (index > 0) {
				pause();
			}
			TourDataSpotModel spot = spots.get(index);
			try {
				DetailCommonItem item = tourApiClient.fetchDetailCommon(spot.contentId());
				String description = item == null || item.overview() == null ? "" : item.overview().strip();
				if (!spotRepository.fillTourApiDescriptionIfMissing(spot.spotId(), description)) {
					// 외부 요청 도중 다른 작업이 소개/소스/공개 상태를 변경했다면 그대로 보존한다.
					skipped++;
				} else if (description.isEmpty()) {
					empty++;
				} else {
					updated++;
				}
			} catch (TourApiQuotaExceededException e) {
				quotaExceeded = true;
				break;
			} catch (Exception e) {
				failed++;
				// HTTP 예외 메시지에는 serviceKey가 포함된 요청 URL이 들어갈 수 있다.
				log.warn("장소 소개 수집 실패: contentId={}, errorType={}", spot.contentId(), e.getClass().getSimpleName());
			}
		}

		int processed = updated + empty + skipped;
		int remaining = spots.size() - processed - failed;
		log.info("장소 소개 수집 완료: 저장 {}건 / 소개없음 {}건 / 건너뜀 {}건 / 실패 {}건 / 미처리 {}건 (한도초과={})",
			updated, empty, skipped, failed, remaining, quotaExceeded);
		return new CollectDescriptionResult(lDongRegnCd, lDongSignguCd, spots.size(), processed,
			updated, empty, skipped, failed, remaining, quotaExceeded);
	}

	private void pause() {
		try {
			Thread.sleep(props.callIntervalMs());
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("장소 소개 수집 중단됨", e);
		}
	}

	/** remainingCount는 아직 호출하지 못한 건수이며, failCount도 다음 실행에서 재시도한다. */
	public record CollectDescriptionResult(
		String lDongRegnCd,
		String lDongSignguCd,
		int targetSpotCount,
		int processedCount,
		int updatedCount,
		int emptyCount,
		int skippedCount,
		int failCount,
		int remainingCount,
		boolean quotaExceeded
	) {
	}
}
