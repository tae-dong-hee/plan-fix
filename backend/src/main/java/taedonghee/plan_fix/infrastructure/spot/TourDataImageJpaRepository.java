package taedonghee.plan_fix.infrastructure.spot;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;

import java.util.Collection;
import java.util.List;

/** [infrastructure] Spring Data JPA 저장소. infrastructure 내부에서만 사용된다. */
public interface TourDataImageJpaRepository extends JpaRepository<TourDataImageJpaEntity, Long> {

	@Query("""
		SELECT i FROM TourDataImageJpaEntity i
		WHERE i.tourDataSpotId = :tourDataSpotId
		ORDER BY i.tourDataImageId ASC
		""")
	List<TourDataImageJpaEntity> findByTourDataSpotId(@Param("tourDataSpotId") Long tourDataSpotId);

	@Query("""
		SELECT new taedonghee.plan_fix.domain.spot.SpotImageCandidate(s.spotId, i.originalImage, i.smallImage)
		FROM TourDataImageJpaEntity i
		JOIN TourDataSpotJpaEntity s ON s.tourDataSpotId = i.tourDataSpotId
		WHERE s.spotId IN :spotIds
		ORDER BY i.tourDataImageId ASC
		""")
	List<SpotImageCandidate> findBySpotIds(@Param("spotIds") Collection<Long> spotIds);

	void deleteByTourDataSpotId(Long tourDataSpotId);
}
