import { UnauthorizedError } from "./spots";

export type AiCourseTheme = "HEALING" | "FOOD" | "CAFE" | "ACTIVITY" | "CULTURE";
export type AiCourseCompanion = "SOLO" | "COUPLE" | "FRIENDS" | "FAMILY";

export type AiCourseDraftRequest = {
  region?: string;
  sigungu?: string;
  startDate: string;
  endDate: string;
  themes: AiCourseTheme[];
  companion: AiCourseCompanion;
  anchorSpotIds: number[];
};

export type AiCourseDraftSpot = {
  spotId: number;
  title: string;
  category: string;
  region: string | null;
  sigungu: string | null;
  address: string | null;
  thumbnail: string | null;
  latitude: number | null;
  longitude: number | null;
  /** 왜 이 장소를 골랐는지. LLM이 생성했거나 규칙 기반 문구다. */
  reason: string;
};

export type AiCourseDraftDay = {
  dayNumber: number;
  spots: AiCourseDraftSpot[];
  /** 이전 서버의 응답에는 없을 수 있다. */
  routeStatus?: "ROAD_DISTANCE" | "UNAVAILABLE" | "NOT_NEEDED";
  drivingDistanceMeters?: number | null;
};

export type AiCourseDraft = {
  title: string;
  startDate: string;
  endDate: string;
  days: AiCourseDraftDay[];
  /** "LLM" 또는 "RULE_BASED". LLM 호출이 실패하면 규칙 기반으로 폴백된다. */
  generatedBy: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

/**
 * AI 코스 초안을 받아온다. 저장은 하지 않고 초안만 돌려주므로,
 * 사용자가 코스 생성 화면에서 고친 뒤 기존 저장 흐름을 타면 된다.
 */
export async function fetchAiCourseDraft(request: AiCourseDraftRequest): Promise<AiCourseDraft> {
  if (!apiBaseUrl) {
    throw new UnauthorizedError();
  }

  const response = await fetch(`${apiBaseUrl}/courses/ai/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  });

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(extractMessage(errorBody) || "AI 코스를 만들지 못했습니다.");
  }

  return (await response.json()) as AiCourseDraft;
}

/** 서버 에러 응답이 JSON이면 message만 꺼내 쓴다. */
function extractMessage(body: string): string {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body) as { message?: string };
    return parsed.message ?? "";
  } catch {
    return body;
  }
}
