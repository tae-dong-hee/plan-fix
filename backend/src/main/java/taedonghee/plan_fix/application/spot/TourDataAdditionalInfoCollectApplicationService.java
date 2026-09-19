package taedonghee.plan_fix.application.spot;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.spot.TourDataInfoRepository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.infrastructure.spot.DetailInfoItem;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;
import taedonghee.plan_fix.infrastructure.spot.TourApiQuotaExceededException;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/** detailInfo2의 이용요금·부대시설 등 반복정보를 기본 이용안내와 독립적으로 수집한다. */
@Slf4j
@Service
@RequiredArgsConstructor
public class TourDataAdditionalInfoCollectApplicationService {

	// 숙박(32)과 여행코스(25)는 infoname/infotext와 다른 응답 구조를 사용한다.
	private static final Set<String> SUPPORTED_TYPES = Set.of("12", "14", "15", "28", "38", "39");

	private final TourApiClient tourApiClient;
	private final TourApiProperties props;
	private final TourDataSpotRepository tourDataSpotRepository;
	private final SpotRepository spotRepository;
	private final TourDataInfoRepository tourDataInfoRepository;

	/** 외부 API 호출은 트랜잭션 밖에서 실행하며, 결과 한 건씩 원자적으로 저장한다. */
	public CollectAdditionalInfoResult collect(String lDongRegnCd, String lDongSignguCd) {
		List<TourDataSpotModel> sources = tourDataSpotRepository
			.findByRegionAndSigungu(lDongRegnCd, lDongSignguCd);
		List<Long> spotIds = sources.stream().map(TourDataSpotModel::spotId).filter(Objects::nonNull).toList();
		Set<Long> activeTourApiIds = spotRepository.findAllByIdIn(spotIds).stream()
			.filter(spot -> spot.status() == SpotStatus.ACTIVE && spot.sourceType() == SpotSourceType.TOUR_API)
			.map(SpotModel::spotId).collect(Collectors.toSet());
		List<TourDataSpotModel> targets = sources.stream()
			.filter(spot -> spot.category() != null && SUPPORTED_TYPES.contains(spot.category()))
			.filter(spot -> activeTourApiIds.contains(spot.spotId()))
			.filter(spot -> tourDataInfoRepository.findByContentId(spot.contentId())
				.map(info -> info.additionalInfo() == null).orElse(true))
			.toList();

		int updated = 0;
		int empty = 0;
		int skipped = 0;
		int failed = 0;
		boolean quotaExceeded = false;
		for (int index = 0; index < targets.size(); index++) {
			if (index > 0) {
				pause();
			}
			TourDataSpotModel spot = targets.get(index);
			try {
				String additionalInfo = format(tourApiClient.fetchDetailInfo(spot.contentId(), spot.category()));
				if (!tourDataInfoRepository.fillAdditionalInfoIfMissing(spot.tourDataSpotId(), additionalInfo)) {
					skipped++;
				} else if (additionalInfo.isEmpty()) {
					empty++;
				} else {
					updated++;
				}
			} catch (TourApiQuotaExceededException e) {
				quotaExceeded = true;
				break;
			} catch (Exception e) {
				failed++;
				// HTTP 예외 메시지에는 인증키가 포함될 수 있어 로그에 기록하지 않는다.
				log.warn("추가 이용안내 수집 실패: contentId={}, errorType={}",
					spot.contentId(), e.getClass().getSimpleName());
			}
		}

		int processed = updated + empty + skipped;
		int remaining = targets.size() - processed - failed;
		log.info("추가 이용안내 수집 완료: 저장 {}건 / 정보없음 {}건 / 건너뜀 {}건 / 실패 {}건 / 미처리 {}건 (한도초과={})",
			updated, empty, skipped, failed, remaining, quotaExceeded);
		return new CollectAdditionalInfoResult(lDongRegnCd, lDongSignguCd, targets.size(), processed,
			updated, empty, skipped, failed, remaining, quotaExceeded);
	}

	private String format(List<DetailInfoItem> items) {
		return items.stream().filter(Objects::nonNull)
			.filter(item -> item.infotext() != null && !item.infotext().isBlank())
			.map(item -> item.infoname() == null || item.infoname().isBlank()
				? item.infotext().strip() : item.infoname().strip() + "\n" + item.infotext().strip())
			.distinct()
			.collect(Collectors.joining("\n\n"));
	}

	private void pause() {
		try {
			Thread.sleep(props.callIntervalMs());
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("추가 이용안내 수집 중단됨", e);
		}
	}

	public record CollectAdditionalInfoResult(
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
