import { UnauthorizedError } from "./spots";

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
  membershipRole?: "OWNER" | "EDITOR" | "VIEWER" | null;
};

export type CreateCourseDayInput = {
  dayNumber: number;
  spots: { spotId: number; memo?: string | null }[];
};

export type CreateCoursePayload = {
  title: string;
  description?: string | null;
  thumbnail?: string | null;
  visibility?: "PUBLIC" | "PRIVATE";
  startDate?: string | null;
  endDate?: string | null;
  days: CreateCourseDayInput[];
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

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
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

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("코스 목록을 불러오지 못했습니다.");
  }

  return (await response.json()) as CourseResponse[];
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
    throw new Error("비공개 코스이거나 접근 권한이 없습니다.");
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

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (response.status === 409) {
    throw new Error("다른 사람이 먼저 일정을 수정했어요. 입력한 내용을 복사해 두고 새로고침한 뒤 다시 저장해 주세요.");
  }
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

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
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

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("좋아요 처리에 실패했습니다.");
  }

  return (await response.json()) as CourseLikeState;
}

