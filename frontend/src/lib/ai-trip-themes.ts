import type { AiCourseDayTheme, AiCourseTheme, AiCourseTripIdea } from "@/services/ai-course";

export const THEME_LABELS: Record<AiCourseTheme, string> = {
  HEALING: "힐링·자연", FOOD: "맛집 탐방", CAFE: "카페 투어", ACTIVITY: "액티비티", CULTURE: "문화·역사",
};

export const TRIP_IDEA_DETAILS: Record<AiCourseTripIdea, { title: string; themes: AiCourseTheme[] }> = {
  COAST_CAFE: { title: "바다와 카페", themes: ["HEALING", "CAFE"] },
  FOOD_WALK: { title: "맛집과 산책", themes: ["HEALING", "FOOD"] },
  NATURE: { title: "자연 속 쉼", themes: ["HEALING"] },
  ACTIVITY: { title: "신나는 액티비티", themes: ["ACTIVITY"] },
  CULTURE_LOCAL: { title: "문화와 골목 여행", themes: ["CULTURE", "FOOD"] },
  CAFE: { title: "여유로운 카페 투어", themes: ["CAFE"] },
};

export function describeDayThemes(day: { themes?: AiCourseTheme[]; tripIdeas?: AiCourseTripIdea[] }): string {
  const ideas = [...new Set(day.tripIdeas ?? [])].filter((id) => Object.prototype.hasOwnProperty.call(TRIP_IDEA_DETAILS, id));
  const covered = new Set(ideas.flatMap((id) => TRIP_IDEA_DETAILS[id].themes));
  const labels = [
    ...ideas.map((id) => TRIP_IDEA_DETAILS[id].title),
    ...[...new Set(day.themes ?? [])].filter((theme) => !covered.has(theme) && Object.prototype.hasOwnProperty.call(THEME_LABELS, theme)).map((theme) => THEME_LABELS[theme]),
  ];
  return labels.join(" · ") || "AI 추천";
}

export type DayThemeChoice = { key: string; label: string; themes: AiCourseTheme[]; tripIdeas: AiCourseTripIdea[] };

export function themeChoices(ideas: AiCourseTripIdea[], manualThemes: AiCourseTheme[]): DayThemeChoice[] {
  const covered = new Set(ideas.flatMap((id) => TRIP_IDEA_DETAILS[id].themes));
  return [
    ...ideas.map((id) => ({ key: `idea:${id}`, label: TRIP_IDEA_DETAILS[id].title, themes: TRIP_IDEA_DETAILS[id].themes, tripIdeas: [id] })),
    ...manualThemes.filter((theme) => !covered.has(theme)).map((theme) => ({ key: `theme:${theme}`, label: THEME_LABELS[theme], themes: [theme], tripIdeas: [] })),
  ];
}

export function dayThemeFromChoices(dayNumber: number, choices: DayThemeChoice[]): AiCourseDayTheme {
  return { dayNumber, themes: [...new Set(choices.flatMap((choice) => choice.themes))], tripIdeas: [...new Set(choices.flatMap((choice) => choice.tripIdeas))] };
}

/** Repeat a short selection across days; combine a longer selection without dropping any choice. */
export function distributeDayThemeChoices(dayCount: number, choices: DayThemeChoice[]): string[][] {
  const result: string[][] = Array.from({ length: dayCount }, () => []);
  if (!choices.length) return result;
  for (let index = 0; index < Math.max(dayCount, choices.length); index += 1) {
    result[index % dayCount].push(choices[index % choices.length].key);
  }
  return result;
}
