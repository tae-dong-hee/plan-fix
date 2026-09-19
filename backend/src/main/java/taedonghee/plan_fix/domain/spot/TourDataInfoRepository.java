package taedonghee.plan_fix.domain.spot;

import java.util.Optional;

/**
 * [domain] 저장소 포트. domain은 이 인터페이스만 알고, 구현(JPA 등)은 infrastructure가 담당한다.
 */
public interface TourDataInfoRepository {

	TourDataInfoModel save(TourDataInfoModel info);

	/** 재수집 시 이미 있는 건인지 판단하는 기준. */
	Optional<TourDataInfoModel> findByContentId(Long contentId);

	/** 활성 TourAPI 장소의 추가 안내만 원자적으로 채운다. 기존 기본정보와 수집된 추가 안내는 보존한다. */
	boolean fillAdditionalInfoIfMissing(Long tourDataSpotId, String additionalInfo);

	long countAll();
}
