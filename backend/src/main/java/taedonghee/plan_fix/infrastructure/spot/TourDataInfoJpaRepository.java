package taedonghee.plan_fix.infrastructure.spot;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** [infrastructure] Spring Data JPA 저장소. infrastructure 내부에서만 사용된다. */
public interface TourDataInfoJpaRepository extends JpaRepository<TourDataInfoJpaEntity, Long> {

	Optional<TourDataInfoJpaEntity> findByContentId(Long contentId);

	/** detailIntro2 저장은 기존 additional_info를 보존한다. 별도 수집기가 먼저 행을 만들 수도 있다. */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query(value = """
		INSERT INTO tour_data_info (
		    tour_data_spot_id, contentid, category, firstmenu, treatmenu, tel, park_info,
		    time_info, rest_info, lcnsno, additional_info, created_at, updated_at
		) VALUES (
		    :#{#info.tourDataSpotId}, :#{#info.contentId}, :#{#info.category},
		    :#{#info.firstMenu}, :#{#info.treatMenu}, :#{#info.tel}, :#{#info.parkInfo},
		    :#{#info.timeInfo}, :#{#info.restInfo}, :#{#info.lcnsno}, :#{#info.additionalInfo},
		    :#{#info.createdAt}, :#{#info.updatedAt}
		)
		ON CONFLICT (contentid) DO UPDATE SET
		    category = EXCLUDED.category, firstmenu = EXCLUDED.firstmenu,
		    treatmenu = EXCLUDED.treatmenu, tel = EXCLUDED.tel, park_info = EXCLUDED.park_info,
		    time_info = EXCLUDED.time_info, rest_info = EXCLUDED.rest_info, lcnsno = EXCLUDED.lcnsno,
		    additional_info = COALESCE(tour_data_info.additional_info, EXCLUDED.additional_info),
		    updated_at = EXCLUDED.updated_at
		""", nativeQuery = true)
	int upsertIntro(@Param("info") TourDataInfoJpaEntity info);

	/** 추가 안내만 갱신하고, 외부 요청 도중 숨김/소스 변경/동시 수집된 경우는 건너뛴다. */
	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query(value = """
		INSERT INTO tour_data_info (
		    tour_data_spot_id, contentid, category, additional_info, created_at, updated_at
		)
		SELECT t.tour_data_spot_id, t.contentid, t.category, :additionalInfo, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
		FROM tour_data_spots t JOIN spots s ON s.spot_id = t.spot_id
		WHERE t.tour_data_spot_id = :tourDataSpotId
		  AND t.category IN ('12', '14', '15', '28', '38', '39')
		  AND s.status = 'ACTIVE' AND s.source_type = 'TOUR_API'
		ON CONFLICT (contentid) DO UPDATE SET
		    additional_info = EXCLUDED.additional_info, updated_at = EXCLUDED.updated_at
		WHERE tour_data_info.additional_info IS NULL
		  AND tour_data_info.tour_data_spot_id = EXCLUDED.tour_data_spot_id
		""", nativeQuery = true)
	int fillAdditionalInfoIfMissing(@Param("tourDataSpotId") Long tourDataSpotId,
		@Param("additionalInfo") String additionalInfo);
}
