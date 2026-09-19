import { dayThemeFromChoices, describeDayThemes, distributeDayThemeChoices, themeChoices } from "./ai-trip-themes";

describe("AI 여행 테마", () => {
  it("공통 취향이 같아도 선택한 추천의 이름을 각각 유지하고 기본 테마 이름은 중복하지 않는다", () => {
    expect(describeDayThemes({
      tripIdeas: ["COAST_CAFE", "NATURE", "COAST_CAFE"],
      themes: ["HEALING", "CAFE", "ACTIVITY", "ACTIVITY"],
    })).toBe("바다와 카페 · 자연 속 쉼 · 액티비티");
    expect(describeDayThemes({})).toBe("AI 추천");
  });

  it("추천에 이미 포함된 기본 취향을 중복 배치하지 않고 추가 취향은 별도 선택으로 유지한다", () => {
    const choices = themeChoices(["COAST_CAFE", "NATURE"], ["HEALING", "CAFE", "CULTURE"]);
    expect(choices.map(({ label }) => label)).toEqual(["바다와 카페", "자연 속 쉼", "문화·역사"]);
    expect(dayThemeFromChoices(1, choices)).toEqual({
      dayNumber: 1,
      themes: ["HEALING", "CAFE", "CULTURE"],
      tripIdeas: ["COAST_CAFE", "NATURE"],
    });
  });

  it("여행 일수보다 선택지가 많아도 모두 배치하고 적으면 각 날짜에 반복한다", () => {
    const choices = themeChoices(["COAST_CAFE", "NATURE", "ACTIVITY"], ["FOOD", "CULTURE"]);
    expect(distributeDayThemeChoices(2, choices)).toEqual([
      ["idea:COAST_CAFE", "idea:ACTIVITY", "theme:CULTURE"],
      ["idea:NATURE", "theme:FOOD"],
    ]);
    expect(distributeDayThemeChoices(3, choices.slice(0, 2))).toEqual([
      ["idea:COAST_CAFE"], ["idea:NATURE"], ["idea:COAST_CAFE"],
    ]);
    expect(distributeDayThemeChoices(3, [])).toEqual([[], [], []]);
  });
});
