package taedonghee.plan_fix.application.course.ai;

import taedonghee.plan_fix.domain.spot.SpotModel;

import java.util.List;
import java.util.Optional;

/** 실제 자동차 도로거리(m). 방향별 거리를 구분하며, 조회 실패를 직선거리로 대체하지 않는다. */
public interface RoadDistanceProvider {

    /** 대각선은 0, 탐색할 수 없는 방향은 Long.MAX_VALUE. 조회 자체가 실패하면 empty. */
    Optional<long[][]> distances(List<SpotModel> spots);
}
