import type { AiCourseDraft } from "@/services/ai-course";

export function aiCourseNotice(draft: AiCourseDraft): string {
  const base = draft.generatedBy === "LLM"
    ? "AI가 짠 초안이에요. 마음에 안 드는 곳은 지우거나 순서를 바꿔보세요."
    : "추천 규칙으로 만든 초안이에요. 자유롭게 고쳐서 쓰세요.";
  const daysToRoute = draft.days.filter((day) => day.spots.length > 1);
  if (!daysToRoute.length || daysToRoute.every((day) => !day.routeStatus)) return base;
  const optimized = daysToRoute.filter((day) => day.routeStatus === "ROAD_DISTANCE").length;
  if (optimized === daysToRoute.length) {
    return `${base} 각 날짜에 담긴 장소는 자동차 도로거리 합계가 가장 짧은 순서로 배치했어요. 지정한 출발·도착지 없이 계산한 순서예요.`;
  }
  if (optimized > 0) {
    return `${base} 도로거리를 확인한 ${optimized}개 날짜는 자동차 이동거리가 짧은 순서로 배치했어요. 나머지 날짜는 도로거리를 확인하지 못해 추천 순서를 유지했어요.`;
  }
  return `${base} 도로거리를 확인하지 못해 추천 순서를 유지했어요.`;
}
