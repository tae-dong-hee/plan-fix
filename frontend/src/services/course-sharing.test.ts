import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "./spots";
import {
  acceptCourseInvitation, CourseSharingError, createCourseInvitation, fetchCourseInvitation,
  fetchCourseInvitations, fetchCourseMembers, fetchCourseSharingStatus, fetchSharedCourses,
  removeCourseMember, revokeCourseInvitation, updateCourseItinerary,
} from "./course-sharing";

describe("course sharing API", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1/");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status });

  it("checks capability without calling invitation or course endpoints", async () => {
    fetchMock.mockResolvedValue(response({ enabled: false }));
    await expect(fetchCourseSharingStatus()).resolves.toEqual({ enabled: false });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://localhost:8080/api/v1/course-sharing/status", { method: "GET", credentials: "include" });
  });

  it("treats older servers as unavailable but preserves network failures", async () => {
    fetchMock.mockResolvedValueOnce(response({}, 404));
    await expect(fetchCourseSharingStatus()).resolves.toEqual({ enabled: false });
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(fetchCourseSharingStatus()).rejects.toMatchObject({ status: 0 });
    vi.stubEnv("VITE_API_BASE_URL", "");
    fetchMock.mockClear();
    await expect(fetchCourseSharingStatus()).resolves.toEqual({ enabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates explicit permission grants and includes session credentials", async () => {
    const created = { invitationId: 9, token: "secret-token", permission: "EDITOR", expiresAt: "2026-09-16T09:00:00Z" };
    fetchMock.mockResolvedValue(response(created));
    await expect(createCourseInvitation(12, "EDITOR")).resolves.toEqual(created);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://localhost:8080/api/v1/courses/12/invitations", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permission: "EDITOR" }) });
  });

  it("loads previews and accepts only through an explicit POST", async () => {
    fetchMock.mockImplementation(async () => response({ courseId: 12, permission: "VIEWER" }));
    await fetchCourseInvitation("abc/123?token");
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/course-invitations/abc%2F123%3Ftoken", { method: "GET", credentials: "include" });
    await acceptCourseInvitation("safe-token");
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/course-invitations/safe-token/accept", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}" });
  });

  it("lists and revokes invitations and memberships with no payload on DELETE", async () => {
    fetchMock.mockImplementation(async () => response([]));
    await fetchCourseInvitations(12);
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/courses/12/invitations", { method: "GET", credentials: "include" });
    await fetchCourseMembers(12);
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/courses/12/members", { method: "GET", credentials: "include" });
    await fetchSharedCourses();
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/courses/shared", { method: "GET", credentials: "include" });
    fetchMock.mockResolvedValue(response(null, 204));
    await expect(revokeCourseInvitation(12, 7)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/courses/12/invitations/7", { method: "DELETE", credentials: "include" });
    await removeCourseMember(12, 8);
    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:8080/api/v1/courses/12/members/8", { method: "DELETE", credentials: "include" });
  });

  it("sends dates, itinerary and the loaded version to the limited edit endpoint", async () => {
    fetchMock.mockResolvedValue(response({ courseId: 12 }));
    const payload = { startDate: "2026-09-12", endDate: "2026-09-12", days: [{ dayNumber: 1, spots: [{ spotId: 9, memo: "아침 산책" }] }], expectedUpdatedAt: "2026-09-09T10:00:00Z" };
    await updateCourseItinerary(12, payload);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://localhost:8080/api/v1/courses/12/itinerary", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  });

  it("distinguishes expired, forbidden, conflicting and unauthenticated requests", async () => {
    for (const status of [403, 404, 409, 410, 503]) {
      fetchMock.mockResolvedValueOnce(response({}, status));
      await expect(fetchCourseInvitation("safe-token")).rejects.toMatchObject({ name: "CourseSharingError", status });
    }
    fetchMock.mockResolvedValueOnce(response({}, 401));
    await expect(acceptCourseInvitation("safe-token")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(new CourseSharingError("test", 410).status).toBe(410);
  });
});
