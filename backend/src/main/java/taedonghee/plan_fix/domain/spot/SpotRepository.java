package taedonghee.plan_fix.domain.spot;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * [domain] 저장소 포트. domain은 이 인터페이스만 알고, 구현(JPA 등)은 infrastructure가 담당한다.
 */
public interface SpotRepository {

	/** 저장 후 id가 채번된 SpotModel을 반환한다. */
	SpotModel save(SpotModel spot);

	Optional<SpotModel> findById(Long spotId);

	List<SpotModel> findAllByIdIn(Collection<Long> spotIds);

	long countAll();

	/**
	 * 공개 목록 조회. status가 ACTIVE인 것만, condition의 null이 아닌 필드로 걸러서,
	 * sort 기준으로 정렬해 offset부터 limit개를 반환한다.
	 */
	List<SpotModel> searchActive(SpotSearchCondition condition, SpotSortType sort, int offset, int limit);

	/** searchActive와 같은 조건으로 전체 건수를 센다(페이지네이션 totalCount용). */
	long countActive(SpotSearchCondition condition);

	/**
	 * view_count를 DB에서 직접 +1 한다(읽고-쓰지 않는 원자적 증가라 동시 조회에도 안전하다).
	 * 존재하지 않는 spotId를 넘기면 아무 일도 하지 않는다.
	 */
	void incrementViewCount(Long spotId);

	/** like_count를 DB에서 직접 +1 한다(원자적). */
	void incrementLikeCount(Long spotId);

	/** like_count를 DB에서 직접 -1 한다. 0 밑으로는 내려가지 않는다. */
	void decrementLikeCount(Long spotId);

	/** 소개만 조건부 갱신한다. 기존 소개·다른 소스·비활성 스팟은 보존하며 서비스 카운터는 건드리지 않는다. */
	boolean fillTourApiDescriptionIfMissing(Long spotId, String description);

	/** 목록 API 필드만 갱신한다. description과 서비스 카운터/상태는 DB의 현재 값을 보존한다. */
	boolean updateTourApiListing(Long spotId, SpotModel.SourceAttributes attributes);

	/** 사용자가 좋아요 누른 활성 스팟 목록 조회 */
	List<SpotModel> findLikedByUserId(Long userId);
}
