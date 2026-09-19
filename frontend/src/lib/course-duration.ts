/** 전체 여행 기간용 표기. 일정 안의 일차(Day 1, 1일차)에는 사용하지 않는다. */
export function formatCourseDuration(dayCount: number): string {
  if (!Number.isInteger(dayCount) || dayCount < 1) return "기간 미정";
  return dayCount === 1 ? "당일치기 여행" : `${dayCount - 1}박 ${dayCount}일`;
}
