import { formatCourseDuration } from "./course-duration";

test.each([
  [1, "당일치기 여행"],
  [2, "1박 2일"],
  [3, "2박 3일"],
  [4, "3박 4일"],
  [5, "4박 5일"],
  [30, "29박 30일"],
])("전체 여행 %i일을 %s로 표시한다", (days, expected) => {
  expect(formatCourseDuration(days)).toBe(expected);
});

test.each([0, -1, 1.5, NaN, Infinity])("유효하지 않은 기간 %s를 당일 여행으로 표시하지 않는다", (days) => {
  expect(formatCourseDuration(days)).toBe("기간 미정");
});
