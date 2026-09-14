import { aiCourseNotice } from "@/lib/ai-course-notice";
import type { AiCourseDraft, AiCourseDraftDay, AiCourseDraftSpot } from "@/services/ai-course";

const spot: AiCourseDraftSpot = {
  spotId: 1, title: "장소", category: "관광지", region: "51", sigungu: "150",
  address: null, thumbnail: null, latitude: 37.7, longitude: 128.8, reason: "산책하기 좋아요.",
};
const day = (routeStatus?: AiCourseDraftDay["routeStatus"], count = 2): AiCourseDraftDay => ({
  dayNumber: 1, spots: Array.from({ length: count }, (_, i) => ({ ...spot, spotId: i + 1 })), routeStatus,
});
const draft = (days: AiCourseDraftDay[], generatedBy = "LLM"): AiCourseDraft => ({
  title: "코스", startDate: "2026-09-14", endDate: "2026-09-16", days, generatedBy,
});

test("이전 서버 응답을 실제 도로거리로 최적화했다고 표시하지 않는다", () => {
  expect(aiCourseNotice(draft([day()]))).toBe("AI가 짠 초안이에요. 마음에 안 드는 곳은 지우거나 순서를 바꿔보세요.");
});

test("모든 일차의 실제 도로거리를 조회한 경우에만 최단 순서를 안내한다", () => {
  const notice = aiCourseNotice(draft([day("ROAD_DISTANCE"), day("NOT_NEEDED", 1)]));
  expect(notice).toContain("각 날짜에 담긴 장소는 자동차 도로거리 합계가 가장 짧은 순서");
  expect(notice).toContain("지정한 출발·도착지 없이");
});

test("일부만 성공하면 실패한 날짜의 추천 순서가 유지됐다고 알린다", () => {
  const notice = aiCourseNotice(draft([day("ROAD_DISTANCE"), day("UNAVAILABLE")], "RULE_BASED"));
  expect(notice).toContain("추천 규칙으로 만든 초안");
  expect(notice).toContain("확인한 1개 날짜");
  expect(notice).toContain("나머지 날짜는 도로거리를 확인하지 못해 추천 순서를 유지");
});

test("키나 API 응답이 없으면 최단거리라는 안내를 하지 않는다", () => {
  const notice = aiCourseNotice(draft([day("UNAVAILABLE")]));
  expect(notice).toContain("도로거리를 확인하지 못해 추천 순서를 유지");
  expect(notice).not.toContain("가장 짧은");
});

test("장소가 한 개 이하인 날은 거리 최적화 성공에 포함하지 않는다", () => {
  const notice = aiCourseNotice(draft([day("NOT_NEEDED", 0), day("NOT_NEEDED", 1)]));
  expect(notice).not.toContain("도로거리");
});
