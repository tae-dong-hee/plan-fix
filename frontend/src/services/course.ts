import { CourseAccessError, CourseConflictError } from "@/lib/course-errors";
import { UnauthorizedError } from "./spots";
import type { AiCourseTheme, AiCourseTripIdea } from "./ai-course";

export type CourseGenerationSource = "LLM" | "RULE_BASED" | "MANUAL";

export type CourseSpotSummary = {
  spotId: number;
  sequence: number;
  memo: string | null;
  title: string;
  category: string;
  region: string | null;
  sigungu: string | null;
  address: string | null;
  thumbnail: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CourseDay = {
  dayNumber: number;
  spots: CourseSpotSummary[];
  themes?: AiCourseTheme[];
  tripIdeas?: AiCourseTripIdea[];
};

export type CourseResponse = {
  courseId: number;
  userId: number;
  title: string;
  description: string | null;
  thumbnail: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  status: "ACTIVE" | "DELETED";
  viewCount: number;
  likeCount: number;
  startDate: string | null;
  endDate: string | null;
  days: CourseDay[];
  createdAt: string;
  updatedAt: string;
  isOwner?: boolean;
  canEdit?: boolean;
  canViewAccommodations?: boolean;
  generatedBy?: CourseGenerationSource | null;
  themes?: AiCourseTheme[];
};

export type CourseInviteRole = "VIEWER" | "EDITOR";
export type CourseInvite = {
  token: string;
  inviteUrl: string;
  memberRole: CourseInviteRole;
  expiresAt: string;
};
export type CourseMember = { userId: number; name?: string | null; username?: string; role: "OWNER" | "VIEWER" | "EDITOR"; joinedAt: string };
export type PendingCourseInvite = { token: string; role: "VIEWER" | "EDITOR"; createdAt: string; expiresAt: string };

/** 소유자가 공동 코스 초대 링크를 생성한다. */
export async function createCourseInvite(courseId: number | string, memberRole: CourseInviteRole): Promise<CourseInvite> {
  const base = getApiBaseUrl();
  if (!base) throw new Error("초대 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  let response: Response;
  try {
    response = await fetch(`${base}/courses/${encodeURIComponent(courseId)}/invites`, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
      body: JSON.stringify({ memberRole }),
    });
  } catch {
    throw new Error("서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
  }
  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 403) throw new CourseAccessError("코스 소유자만 친구를 초대할 수 있습니다.");
  if (response.status === 404) throw new Error("코스 또는 초대 기능을 찾을 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
  if (!response.ok) {
    if (response.status === 400) {
      const body: unknown = await response.json().catch(() => null);
      if (body && typeof body === "object" && "message" in body && typeof body.message === "string" && body.message.trim()) {
        throw new Error(body.message);
      }
    }
    throw new Error("초대 링크 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return (await response.json()) as CourseInvite;
}

export async function fetchCourseMembers(courseId: number | string): Promise<CourseMember[]> {
  const base = getApiBaseUrl(); if (!base) return [];
  const response = await fetch(`${base}/courses/${courseId}/members`, { credentials: "include" });
  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) throw new Error("초대된 친구 목록을 불러오지 못했습니다.");
  return (await response.json()) as CourseMember[];
}

export async function fetchPendingCourseInvites(courseId: number | string): Promise<PendingCourseInvite[]> {
  const base = getApiBaseUrl(); if (!base) return [];
  const response = await fetch(`${base}/courses/${courseId}/invites`, { credentials: "include" });
  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) throw new Error("승인 대기 초대 목록을 불러오지 못했습니다.");
  return (await response.json()) as PendingCourseInvite[];
}

export async function updateCourseMemberRole(courseId: number | string, userId: number, role: CourseInviteRole) {
  const base = getApiBaseUrl(); if (!base) return;
  const response = await fetch(`${base}/courses/${courseId}/members/${userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ role }) });
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) throw new Error("권한을 변경하지 못했습니다.");
}

export async function cancelCourseInvite(courseId: number | string, token: string) {
  const base = getApiBaseUrl(); if (!base) return;
  const response = await fetch(`${base}/courses/${courseId}/invites/${token}`, { method: "DELETE", credentials: "include" });
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) throw new Error("초대를 취소하지 못했습니다.");
}

export async function removeCourseMember(courseId: number | string, userId: number) {
  const base = getApiBaseUrl(); if (!base) return;
  const response = await fetch(`${base}/courses/${courseId}/members/${userId}`, { method: "DELETE", credentials: "include" });
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) throw new Error("멤버를 삭제하지 못했습니다.");
}

export type PublicCourseItem = {
  courseId: number;
  userId: number;
  title: string;
  description: string | null;
  thumbnail: string | null;
  viewCount: number;
  likeCount: number;
  dayCount: number;
  spotCount: number;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  generatedBy?: CourseGenerationSource | null;
  themes?: AiCourseTheme[];
};

export type PublicCourseList = {
  items: PublicCourseItem[];
  offset: number;
  size: number;
  totalCount: number;
};

export type CreateCourseDayInput = {
  dayNumber: number;
  spots: { spotId: number; memo?: string | null }[];
  themes?: AiCourseTheme[];
  tripIdeas?: AiCourseTripIdea[];
};

export type CreateCoursePayload = {
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  visibility?: "PUBLIC" | "PRIVATE";
  startDate?: string | null;
  endDate?: string | null;
  days: CreateCourseDayInput[];
  generatedBy?: CourseGenerationSource | null;
  themes?: AiCourseTheme[];
};

function getApiBaseUrl(): string | undefined {
  return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
}

/** 코스 생성 API 호출 */
export async function createCourse(payload: CreateCoursePayload): Promise<CourseResponse> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new UnauthorizedError();
  }

  const response = await fetch(`${apiBaseUrl}/courses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(errorBody || "코스 생성에 실패했습니다.");
  }

  return (await response.json()) as CourseResponse;
}

/** 내 코스 목록 조회 API 호출 */
export async function fetchMyCourses(): Promise<CourseResponse[]> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return [];
  }

  const response = await fetch(`${apiBaseUrl}/courses`, {
    credentials: "include",
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) {
    throw new Error("코스 목록을 불러오지 못했습니다.");
  }

  return (await response.json()) as CourseResponse[];
}

/** 공개 코스 목록 조회(최신순, 인기순 또는 무작위) */
export async function fetchPublicCourses(params: {
  sort?: "latest" | "popular" | "random";
  offset?: number;
  size?: number;
} = {}): Promise<PublicCourseList> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return { items: [], offset: params.offset ?? 0, size: params.size ?? 20, totalCount: 0 };
  }

  const query = new URLSearchParams({
    sort: params.sort ?? "latest",
    offset: String(params.offset ?? 0),
    size: String(params.size ?? 20),
  });
  const response = await fetch(`${apiBaseUrl}/courses/public?${query.toString()}`, {
    credentials: "include",
    ...(params.sort === "random" ? { cache: "no-store" as const } : {}),
  });
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) {
    throw new Error("공개 코스 목록을 불러오지 못했습니다.");
  }
  return (await response.json()) as PublicCourseList;
}

/** 코스 단건 조회 API 호출 */
export async function fetchCourse(courseId: number | string): Promise<CourseResponse | null> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/courses/${courseId}`, {
    credentials: "include",
  });

  if (response.status === 404) {
    return null;
  }
  if (response.status === 403) {
    throw new CourseAccessError("비공개 코스이거나 접근 권한이 없습니다.");
  }
  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("코스 정보를 불러오지 못했습니다.");
  }

  return (await response.json()) as CourseResponse;
}

export type UpdateCoursePayload = CreateCoursePayload & { expectedUpdatedAt?: string };

export type CourseAccommodation = {
  name: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  memo?: string | null;
};

export async function geocodeAccommodationAddress(
  address: string,
): Promise<{ address: string; latitude: number; longitude: number } | null> {
  const base = getApiBaseUrl();
  if (!base || !address.trim()) return null;
  const response = await fetch(`${base}/locations/geocode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!response.ok) return null;
  return await response.json();
}

export type AccommodationSearchResult = {
  type: "ADDRESS" | "PLACE";
  name: string;
  address: string;
  latitude: number;
  longitude: number;
};

export async function searchAccommodation(query: string): Promise<AccommodationSearchResult[]> {
  const base = getApiBaseUrl();
  if (!base || query.trim().length < 2) return [];
  try {
    const response = await fetch(`${base}/locations/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: query }),
    });
    return response.ok ? await response.json() as AccommodationSearchResult[] : [];
  } catch {
    return [];
  }
}

export async function searchAddressSuggestions(query: string): Promise<AccommodationSearchResult[]> {
  const base = getApiBaseUrl();
  if (!base || query.trim().length < 2) return [];
  try {
    const response = await fetch(`${base}/locations/address-suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: query }),
    });
    return response.ok ? await response.json() as AccommodationSearchResult[] : [];
  } catch {
    return [];
  }
}

export type DayAccommodation = CourseAccommodation & { dayNumber: number };

export async function fetchDayAccommodations(courseId: number | string): Promise<DayAccommodation[]> {
  const base = getApiBaseUrl();
  if (!base) return [];
  const response = await fetch(`${base}/courses/${courseId}/day-accommodations`, {
    credentials: "include",
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) throw new Error("숙소 정보를 불러오지 못했습니다. 최신 코스를 다시 불러와 주세요.");
  return await response.json() as DayAccommodation[];
}

export async function saveDayAccommodations(courseId: number | string, values: DayAccommodation[]): Promise<void> {
  const base = getApiBaseUrl();
  if (!base) throw new UnauthorizedError();
  const response = await fetch(`${base}/courses/${courseId}/day-accommodations`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(values),
  });
  if (response.status === 403) throw new CourseAccessError();
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("날짜별 숙소를 저장하지 못했습니다.");
}

export type DrivingRoutePoint = { latitude: number; longitude: number };
export type DrivingRoute = { paths: DrivingRoutePoint[][] };

/** 서버가 카카오 자동차 길찾기로 계산한 실제 도로 좌표를 가져온다. */
export async function fetchDrivingRoute(points: DrivingRoutePoint[]): Promise<DrivingRoute | null> {
  const apiBaseUrl = getApiBaseUrl();
  if (points.length < 2 || !apiBaseUrl) return null;
  try {
    const response = await fetch(`${apiBaseUrl}/routes/driving`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ points }),
    });
    if (!response.ok) return null;
    const route = await response.json() as DrivingRoute;
    return Array.isArray(route.paths) && route.paths.every((path) => Array.isArray(path) && path.length >= 2)
      ? route : null;
  } catch {
    return null;
  }
}

/** 코스 수정 API 호출 */
export async function updateCourse(
  courseId: number | string,
  payload: UpdateCoursePayload
): Promise<CourseResponse> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new UnauthorizedError();
  }

  const response = await fetch(`${apiBaseUrl}/courses/${courseId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (response.status === 403) throw new CourseAccessError();
  if (response.status === 409) throw new CourseConflictError();
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(errorBody || "코스 수정에 실패했습니다.");
  }

  return (await response.json()) as CourseResponse;
}

/** 코스 삭제 API 호출 */
export async function deleteCourse(courseId: number | string): Promise<CourseResponse> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new UnauthorizedError();
  }

  const response = await fetch(`${apiBaseUrl}/courses/${courseId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(errorBody || "코스 삭제에 실패했습니다.");
  }

  return (await response.json()) as CourseResponse;
}

export type CourseLikeState = {
  liked: boolean;
  likeCount: number;
};

/** 이미 좋아요한 상태에서 또 호출해도 에러 없이 현재 상태를 그대로 돌려준다(idempotent). */
export async function likeCourse(courseId: number | string): Promise<CourseLikeState> {
  return callCourseLikeApi(courseId, "POST");
}

/** 좋아요하지 않은 상태에서 호출해도 에러 없이 현재 상태를 그대로 돌려준다(idempotent). */
export async function unlikeCourse(courseId: number | string): Promise<CourseLikeState> {
  return callCourseLikeApi(courseId, "DELETE");
}

async function callCourseLikeApi(courseId: number | string, method: "POST" | "DELETE"): Promise<CourseLikeState> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new UnauthorizedError();
  }

  const response = await fetch(`${apiBaseUrl}/courses/${courseId}/like`, {
    method,
    credentials: "include",
  });

  if (response.status === 401) {
    throw new UnauthorizedError();
  }
  if (response.status === 403) throw new CourseAccessError();
  if (!response.ok) {
    throw new Error("좋아요 처리에 실패했습니다.");
  }

  return (await response.json()) as CourseLikeState;
}
