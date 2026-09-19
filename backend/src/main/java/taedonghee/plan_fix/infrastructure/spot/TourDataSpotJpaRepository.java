package taedonghee.plan_fix.infrastructure.spot;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/** [infrastructure] Spring Data JPA 저장소. infrastructure 내부에서만 사용된다. */
public interface TourDataSpotJpaRepository extends JpaRepository<TourDataSpotJpaEntity, Long> {

	Optional<TourDataSpotJpaEntity> findByContentId(Long contentId);

	Optional<TourDataSpotJpaEntity> findBySpotId(Long spotId);

	List<TourDataSpotJpaEntity> findByRegAndSigungu(String reg, String sigungu);

	List<TourDataSpotJpaEntity> findByRegAndSigunguAndImageCollectedAtIsNull(String reg, String sigungu);

	List<TourDataSpotJpaEntity> findByRegAndSigunguAndInfoCollectedAtIsNull(String reg, String sigungu);

	@Query("""
		SELECT t FROM TourDataSpotJpaEntity t
		JOIN SpotJpaEntity s ON s.spotId = t.spotId
		WHERE t.reg = :reg AND t.sigungu = :sigungu
		  AND s.sourceType = taedonghee.plan_fix.domain.spot.SpotSourceType.TOUR_API
		  AND s.status = taedonghee.plan_fix.domain.spot.SpotStatus.ACTIVE
		  AND s.description IS NULL
		ORDER BY t.tourDataSpotId
		""")
	List<TourDataSpotJpaEntity> findDescriptionsNotCollected(@Param("reg") String reg, @Param("sigungu") String sigungu);
}
