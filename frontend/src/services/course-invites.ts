import type { CourseInviteRole } from "./course";

export type CourseInvitePreview = {
  courseId: number;
  courseTitle: string;
  memberRole: CourseInviteRole;
  expiresAt: string;
};

export type CourseInviteAcceptResult = {
  courseId: number;
  joined: boolean;
  alreadyMember: boolean;
};

export class CourseInviteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "CourseInviteError";
  }
}

/** 초대를 확인하는 GET 요청은 멤버를 추가하지 않는다. */
export function fetchCourseInvite(token: string, signal?: AbortSignal): Promise<CourseInvitePreview> {
  return requestInvite(token, false, signal);
}

/** 로그인한 사용자가 참여를 선택했을 때만 호출한다. */
export function acceptCourseInvite(token: string): Promise<CourseInviteAcceptResult> {
  return requestInvite(token, true);
}

export function fetchCourseInviteShareStatus(token: string, requestId: string, signal?: AbortSignal): Promise<{ shared: boolean }> {
  return requestInvite(token, false, signal, `/kakao-shares/${encodeURIComponent(requestId)}`);
}

async function requestInvite<T>(token: string, accepting: boolean, signal?: AbortSignal, subpath = ""): Promise<T> {
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!base) {
    throw new CourseInviteError(0, "초대 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  }

  let response: Response;
  try {
    response = await fetch(`${base}/course-invites/${encodeURIComponent(token)}${accepting ? "/accept" : subpath}`, {
      method: accepting ? "POST" : "GET",
      credentials: "include",
      ...(subpath ? { cache: "no-store" as const } : {}),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw error;
    }
    throw new CourseInviteError(0, "서버에 연결하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.");
  }

  if (!response.ok) {
    const fallback = errorMessage(response.status, accepting);
    const body: unknown = await response.json().catch(() => null);
    // HTML 오류 페이지나 JSON 객체 전체가 화면에 표시되지 않도록 message 문자열만 사용한다.
    const message = response.status < 500 && body && typeof body === "object" && "message" in body
      && typeof body.message === "string" && body.message.trim()
      ? body.message.trim()
      : fallback;
    throw new CourseInviteError(response.status, message);
  }

  return response.json() as Promise<T>;
}

function errorMessage(status: number, accepting: boolean): string {
  switch (status) {
    case 400:
      return "만료되었거나 올바르지 않은 초대 링크입니다. 새 초대 링크를 요청해 주세요.";
    case 401:
      return "로그인 후 초대를 수락해 주세요.";
    case 403:
      return "이 초대에 참여할 권한이 없습니다.";
    case 404:
      return "초대 링크가 취소되었거나 존재하지 않습니다.";
    default:
      return accepting ? "초대를 수락하지 못했습니다. 다시 시도해 주세요." : "초대 정보를 불러오지 못했습니다. 다시 시도해 주세요.";
  }
}
