package taedonghee.plan_fix.domain.spot;

import java.util.Collection;
import java.util.List;

/** 메인 추천에 쓸 공개 TourAPI 장소 후보만 한 번에 조회한다. */
public interface RecommendedSpotRepository {

    List<SpotModel> findActiveCandidates(Collection<String> titles, String region, String sigungu);
}
