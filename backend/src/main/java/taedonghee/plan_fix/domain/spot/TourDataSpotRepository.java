package taedonghee.plan_fix.domain.spot;

import java.util.List;
import java.util.Optional;

/**
 * [domain] 저장소 포트. domain은 이 인터페이스만 알고, 구현(JPA 등)은 infrastructure가 담당한다.
 */
public interface TourDataSpotRepository {

	TourDataSpotModel save(TourDataSpotModel tourDataSpot);

	/** 재수집 시 이미 있는 건인지 판단하는 기준. TourAPI의 contentId는 콘텐츠마다 고유하다. */
	Optional<TourDataSpotModel> findByContentId(Long contentId);

	/** canonical spots.spot_id로 이 스팟을 수집한 원본을 역참조한다. 상세 조회에서 부가 정보를 찾아갈 때 쓴다. */
	Optional<TourDataSpotModel> findBySpotId(Long spotId);

	/**
	 * 시군구코드는 시도코드 안에서만 유일하다(예: 150은 여러 시도에 존재).
	 * 따라서 지역 기준 조회는 reg(시도)와 sigungu(시군구)를 반드시 함께 걸어야 한다.
	 */
	List<TourDataSpotModel> findByRegionAndSigungu(String reg, String sigungu);

	/** 아직 detailImage2를 시도하지 않은 건. 재실행 시 이미 끝난 건을 건너뛰기 위해 쓴다. */
	List<TourDataSpotModel> findByRegionAndSigunguAndImageNotCollected(String reg, String sigungu);

	/** 아직 detailIntro2를 시도하지 않은 건. */
	List<TourDataSpotModel> findByRegionAndSigunguAndInfoNotCollected(String reg, String sigungu);

	/** 활성 TourAPI 스팟 중 소개를 아직 수집하지 않은 건(description IS NULL). 빈 문자열은 수집 완료다. */
	List<TourDataSpotModel> findByRegionAndSigunguAndDescriptionNotCollected(String reg, String sigungu);

	long countAll();
}
