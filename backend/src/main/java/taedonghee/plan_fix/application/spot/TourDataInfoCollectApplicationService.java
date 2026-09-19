package taedonghee.plan_fix.application.spot;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import taedonghee.plan_fix.domain.spot.TourDataInfoModel;
import taedonghee.plan_fix.domain.spot.TourDataInfoRepository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.infrastructure.spot.DetailIntroItem;
import taedonghee.plan_fix.infrastructure.spot.TourApiClient;
import taedonghee.plan_fix.infrastructure.spot.TourApiProperties;
import taedonghee.plan_fix.infrastructure.spot.TourApiQuotaExceededException;

import java.util.List;
import java.util.Optional;

/**
 * [application] detailIntro2로 각 관광데이터 스팟의 상세 정보를 수집한다.
 *
 * 호출에 필요한 contentId와 category(contentTypeId)는 이미 저장된 TourDataSpotModel에서 가져오므로,
 * 이 작업 전에 스팟 수집(collect)이 먼저 끝나 있어야 한다.
 *
 * detailIntro2는 category마다 응답 필드명이 달라서(예: 관광지=usetime, 음식점=opentimefood),
 * 타입별 필드를 공통 컬럼(tel/parkInfo/timeInfo/restInfo)으로 정규화해 저장한다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TourDataInfoCollectApplicationService {

	private static final String ATTRACTION = "12";
	private static final String CULTURAL_FACILITY = "14";
	private static final String FESTIVAL = "15";
	private static final String TRAVEL_COURSE = "25";
	private static final String LEPORTS = "28";
	private static final String LODGING = "32";
	private static final String SHOPPING = "38";
	private static final String RESTAURANT = "39";

	private final TourApiClient tourApiClient;
	private final TourApiProperties props;
	private final TourDataSpotRepository tourDataSpotRepository;
	private final TourDataInfoRepository tourDataInfoRepository;

	/**
	 * 의도적으로 @Transactional을 붙이지 않는다. 1000건 넘는 외부 API 호출을 한 트랜잭션으로 묶으면
	 * 도중에 예외가 나갈 때 그때까지 찍어둔 infoCollectedAt이 전부 롤백되어 진행 상황이 사라지고,
	 * DB 트랜잭션도 수 분간 열려 있게 된다. 건별로 커밋되게 두어야 중단 지점부터 재개할 수 있다.
	 */
	public CollectInfoResult collect(String lDongRegnCd, String lDongSignguCd) {
		List<TourDataSpotModel> spots =
			tourDataSpotRepository.findByRegionAndSigunguAndInfoNotCollected(lDongRegnCd, lDongSignguCd);
		log.info("상세정보 수집 대상(미수집) 스팟: {}건", spots.size());

		int created = 0;
		int updated = 0;
		int emptyCount = 0;
		int failCount = 0;
		int processed = 0;
		boolean quotaExceeded = false;

		for (TourDataSpotModel spot : spots) {
			try {
				switch (collectOne(spot)) {
					case CREATED -> created++;
					case UPDATED -> updated++;
					case EMPTY -> emptyCount++;
				}
				processed++;
			} catch (TourApiQuotaExceededException e) {
				// 키 전체가 막힌 상태라 계속 호출해도 전부 실패한다. 남은 건은 다음 실행에서 이어서 처리.
				quotaExceeded = true;
				log.warn("일일 요청 한도 초과로 중단합니다. 처리 {}건 / 남은 {}건은 다음 실행 대상입니다.",
					processed, spots.size() - processed);
				break;
			} catch (Exception e) {
				failCount++;
				log.warn("상세정보 수집 실패: contentId={}, {}", spot.contentId(), e.getMessage());
			}
			sleep();
		}

		int remaining = spots.size() - processed - failCount;
		log.info("상세정보 수집 완료: 신규 {}건 / 갱신 {}건 / 상세없음 {}건 / 실패 {}건 / 남은 {}건 (한도초과중단={})",
			created, updated, emptyCount, failCount, remaining, quotaExceeded);
		return new CollectInfoResult(lDongRegnCd, lDongSignguCd, spots.size(), processed, created, updated, emptyCount,
			failCount, remaining, quotaExceeded);
	}

	private Outcome collectOne(TourDataSpotModel spot) {
		DetailIntroItem item = tourApiClient.fetchDetailIntro(spot.contentId(), spot.category());

		if (item == null) {
			// 상세 정보가 없어도 "시도했음"을 남겨서 다음 실행 때 다시 호출하지 않게 한다
			markCollected(spot);
			return Outcome.EMPTY;
		}

		String category = spot.category();
		String firstMenu = blankToNull(firstMenu(category, item));
		String treatMenu = blankToNull(treatMenu(category, item));
		String tel = blankToNull(tel(category, item));
		String parkInfo = blankToNull(parkInfo(category, item));
		String timeInfo = blankToNull(timeInfo(category, item));
		String restInfo = blankToNull(restInfo(category, item));
		String lcnsno = blankToNull(lcnsno(category, item));

		Optional<TourDataInfoModel> existing = tourDataInfoRepository.findByContentId(spot.contentId());
		if (existing.isPresent()) {
			TourDataInfoModel target = existing.get();
			target.updateFromTourApi(category, firstMenu, treatMenu, tel, parkInfo, timeInfo, restInfo, lcnsno);
			tourDataInfoRepository.save(target);
			markCollected(spot);
			return Outcome.UPDATED;
		}

		tourDataInfoRepository.save(TourDataInfoModel.builder()
			.tourDataSpotId(spot.tourDataSpotId())
			.contentId(spot.contentId())
			.category(category)
			.firstMenu(firstMenu)
			.treatMenu(treatMenu)
			.tel(tel)
			.parkInfo(parkInfo)
			.timeInfo(timeInfo)
			.restInfo(restInfo)
			.lcnsno(lcnsno)
			.build());
		markCollected(spot);
		return Outcome.CREATED;
	}

	/**
	 * "시도했음" 도장. 반드시 실제 데이터 저장이 끝난 뒤에 찍어야 한다.
	 * 트랜잭션이 save 단위로 쪼개져 있어서, 도장을 먼저 찍으면 이후 저장이 실패했을 때
	 * 도장만 남아 다음 실행 대상에서 빠지고 그 스팟의 상세정보가 영영 안 들어온다.
	 */
	private void markCollected(TourDataSpotModel spot) {
		spot.markInfoCollected();
		tourDataSpotRepository.save(spot);
	}

	/** 문의·안내 전화 */
	private String tel(String category, DetailIntroItem item) {
		if (category == null) {
			return null;
		}
		return switch (category) {
			case ATTRACTION -> item.infocenter();
			case CULTURAL_FACILITY -> item.infocenterculture();
			case FESTIVAL -> item.sponsor1tel();
			case TRAVEL_COURSE -> item.infocentertourcourse();
			case LEPORTS -> item.infocenterleports();
			case LODGING -> item.infocenterlodging();
			case SHOPPING -> item.infocentershopping();
			case RESTAURANT -> item.infocenterfood();
			default -> null;
		};
	}

	/** 주차 정보 (축제·여행코스는 해당 필드 없음) */
	private String parkInfo(String category, DetailIntroItem item) {
		if (category == null) {
			return null;
		}
		return switch (category) {
			case ATTRACTION -> item.parking();
			case CULTURAL_FACILITY -> item.parkingculture();
			case LEPORTS -> item.parkingleports();
			case LODGING -> item.parkinglodging();
			case SHOPPING -> item.parkingshopping();
			case RESTAURANT -> item.parkingfood();
			default -> null;
		};
	}

	/** 이용/영업 시간 (숙박은 체크인 시각) */
	private String timeInfo(String category, DetailIntroItem item) {
		if (category == null) {
			return null;
		}
		return switch (category) {
			case ATTRACTION -> item.usetime();
			case CULTURAL_FACILITY -> item.usetimeculture();
			// usetimefestival은 이름과 달리 이용요금이며, 공연시간은 playtime이다.
			case FESTIVAL -> item.playtime();
			case TRAVEL_COURSE -> item.taketime();
			case LEPORTS -> item.usetimeleports();
			case LODGING -> item.checkintime();
			case SHOPPING -> item.opentime();
			case RESTAURANT -> item.opentimefood();
			default -> null;
		};
	}

	/** 휴무일 (축제·여행코스·숙박은 해당 필드 없음) */
	private String restInfo(String category, DetailIntroItem item) {
		if (category == null) {
			return null;
		}
		return switch (category) {
			case ATTRACTION -> item.restdate();
			case CULTURAL_FACILITY -> item.restdateculture();
			case LEPORTS -> item.restdateleports();
			case SHOPPING -> item.restdateshopping();
			case RESTAURANT -> item.restdatefood();
			default -> null;
		};
	}

	/** 대표 메뉴 - 음식점(39)만 해당 */
	private String firstMenu(String category, DetailIntroItem item) {
		return RESTAURANT.equals(category) ? item.firstmenu() : null;
	}

	/** 취급 메뉴 - 음식점(39)만 해당 */
	private String treatMenu(String category, DetailIntroItem item) {
		return RESTAURANT.equals(category) ? item.treatmenu() : null;
	}

	/** 인허가번호 - 음식점(39)만 해당 */
	private String lcnsno(String category, DetailIntroItem item) {
		return RESTAURANT.equals(category) ? item.lcnsno() : null;
	}

	private String blankToNull(String value) {
		return (value == null || value.isBlank()) ? null : value;
	}

	private void sleep() {
		try {
			Thread.sleep(props.callIntervalMs());
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("상세정보 수집 중단됨", e);
		}
	}

	private enum Outcome { CREATED, UPDATED, EMPTY }

	public record CollectInfoResult(
		String lDongRegnCd,
		String lDongSignguCd,
		int targetSpotCount,
		int processedCount,
		int createdCount,
		int updatedCount,
		int emptyCount,
		int failCount,
		int remainingCount,
		boolean quotaExceeded
	) {
	}
}
