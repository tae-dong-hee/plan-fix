package taedonghee.plan_fix.domain.spot;

import java.util.List;
import java.util.Collection;

/**
 * [domain] 저장소 포트. domain은 이 인터페이스만 알고, 구현(JPA 등)은 infrastructure가 담당한다.
 */
public interface TourDataImageRepository {

	TourDataImageModel save(TourDataImageModel image);

	void saveAll(List<TourDataImageModel> images);

	List<TourDataImageModel> findByTourDataSpotId(Long tourDataSpotId);

	/** 여러 장소의 상세사진을 저장 순서대로 한 번에 조회한다. */
	List<SpotImageCandidate> findBySpotIds(Collection<Long> spotIds);

	/** 재수집 시 같은 이미지가 중복 누적되지 않도록, 해당 스팟의 기존 이미지를 먼저 지운다. */
	void deleteByTourDataSpotId(Long tourDataSpotId);

	long countAll();
}
