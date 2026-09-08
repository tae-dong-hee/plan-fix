import type { CourseResponse, CreateCourseDayInput } from "./course";
import { UnauthorizedError } from "./spots";

export type CoursePermission = "VIEWER" | "EDITOR";
export type CourseInvitation = { invitationId: number; permission: CoursePermission; expiresAt: string; revoked: boolean };
export type CreatedCourseInvitation = Omit<CourseInvitation, "revoked"> & { token: string };
export type CourseMember = { userId: number; username: string; permission: CoursePermission };
export type CourseInvitationPreview = { course: CourseResponse; permission: CoursePermission; expiresAt: string };
export type CourseItineraryPayload = {
  startDate: string | null;
  endDate: string | null;
  days: CreateCourseDayInput[];
  expectedUpdatedAt: string;
};

export class CourseSharingError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "CourseSharingError";
  }
}

async function request<T>(path: string, method = "GET", payload?: unknown): Promise<T> {
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  if (!base) throw new CourseSharingError("서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.", 503);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      credentials: "include",
      ...(payload === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    });
  } catch {
    throw new CourseSharingError("인터넷 연결을 확인하고 다시 시도해 주세요.", 0);
  }
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) {
    const messages: Record<number, string> = {
      403: "이 코스에 대한 권한이 없어요.",
      404: "초대 또는 코스를 찾을 수 없어요.",
      409: "코스가 변경되었어요. 새로 불러온 뒤 다시 시도해 주세요.",
      410: "만료되었거나 취소된 초대예요. 새 초대 링크를 받아 주세요.",
      503: "친구 초대 기능을 준비하고 있어요. 잠시 후 다시 시도해 주세요.",
    };
    throw new CourseSharingError(messages[response.status] || "요청을 처리하지 못했어요. 다시 시도해 주세요.", response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function fetchCourseSharingStatus(): Promise<{ enabled: boolean }> {
  if (!import.meta.env.VITE_API_BASE_URL) return { enabled: false };
  try {
    return await request<{ enabled: boolean }>("/course-sharing/status");
  } catch (error) {
    // Older servers do not expose this optional feature yet.
    if (error instanceof CourseSharingError && error.status === 404) return { enabled: false };
    throw error;
  }
}

export function createCourseInvitation(courseId: number, permission: CoursePermission) {
  return request<CreatedCourseInvitation>(`/courses/${courseId}/invitations`, "POST", { permission });
}
export function fetchCourseInvitations(courseId: number) {
  return request<CourseInvitation[]>(`/courses/${courseId}/invitations`);
}
export function revokeCourseInvitation(courseId: number, invitationId: number) {
  return request<void>(`/courses/${courseId}/invitations/${invitationId}`, "DELETE");
}
export function fetchCourseMembers(courseId: number) {
  return request<CourseMember[]>(`/courses/${courseId}/members`);
}
export function removeCourseMember(courseId: number, userId: number) {
  return request<void>(`/courses/${courseId}/members/${userId}`, "DELETE");
}
export function fetchCourseInvitation(token: string) {
  return request<CourseInvitationPreview>(`/course-invitations/${encodeURIComponent(token)}`);
}
export function acceptCourseInvitation(token: string) {
  return request<{ courseId: number; permission: CoursePermission }>(`/course-invitations/${encodeURIComponent(token)}/accept`, "POST", {});
}
export function fetchSharedCourses() {
  return request<CourseResponse[]>("/courses/shared");
}
export function updateCourseItinerary(courseId: number | string, payload: CourseItineraryPayload) {
  return request<CourseResponse>(`/courses/${courseId}/itinerary`, "PATCH", payload);
}
