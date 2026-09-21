import { cancelCourseInvite, cancelCourseInviteGroup, fetchCourseInviteGroups, fetchCourseMembers, fetchPendingCourseInvites, removeCourseMember, updateCourseMemberRole } from "./course";
import { CourseAccessError } from "@/lib/course-errors";
import { UnauthorizedError } from "./spots";
import { setApiBaseUrl } from "@/test-utils/env";

const fetchMock = vi.fn();
const changes = [
  { name: "권한 변경", call: () => updateCourseMemberRole(12, 3, "VIEWER"), path: "members/3", method: "PATCH", error: "권한을 변경하지 못했습니다." },
  { name: "멤버 회수", call: () => removeCourseMember(12, 3), path: "members/3", method: "DELETE", error: "멤버를 삭제하지 못했습니다." },
  { name: "초대 취소", call: () => cancelCourseInvite(12, "friend-token"), path: "invites/friend-token", method: "DELETE", error: "초대를 취소하지 못했습니다." },
  { name: "편집 초대 전체 취소", call: () => cancelCourseInviteGroup(12, "EDITOR"), path: "invite-groups/EDITOR", method: "DELETE", error: "초대를 취소하지 못했습니다." },
  { name: "읽기 초대 전체 취소", call: () => cancelCourseInviteGroup(12, "VIEWER"), path: "invite-groups/VIEWER", method: "DELETE", error: "초대를 취소하지 못했습니다." },
];

beforeEach(() => {
  setApiBaseUrl("http://localhost:8080/api/v1");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { setApiBaseUrl(undefined); vi.unstubAllGlobals(); });

it.each(changes)("$name 요청은 인증 쿠키와 정확한 대상만 보낸다", async ({ call, path, method }) => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  await expect(call()).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`http://localhost:8080/api/v1/courses/12/${path}`, {
    method, credentials: "include",
    ...(method === "PATCH" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "VIEWER" }) } : {}),
  });
});

it.each(changes)("$name 중 인증 만료와 권한 거부를 구분한다", async ({ call }) => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(call()).rejects.toBeInstanceOf(UnauthorizedError);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(call()).rejects.toBeInstanceOf(CourseAccessError);
});

it.each(changes)("$name 실패는 성공 처리되지 않으며 서버 내부 오류를 노출하지 않는다", async ({ call, error }) => {
  fetchMock.mockResolvedValue(new Response("<html>internal SQL error</html>", { status: 500 }));
  await expect(call()).rejects.toThrow(error);
});

it.each([
  ...changes,
  { name: "멤버 조회", call: () => fetchCourseMembers(12) },
  { name: "초대 조회", call: () => fetchPendingCourseInvites(12) },
  { name: "권한별 초대 조회", call: () => fetchCourseInviteGroups(12) },
])("API 설정이 없으면 $name 결과를 성공이나 빈 목록으로 위장하지 않는다", async ({ call }) => {
  setApiBaseUrl("   ");
  await expect(call()).rejects.toThrow("멤버 및 초대 관리 서비스를 사용할 수 없습니다.");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("권한별 초대 조회는 인증 쿠키를 보내고 토큰 없는 최신 초대 정보를 반환한다", async () => {
  const groups = [
    { role: "EDITOR", createdAt: "2026-09-19T12:00:00Z", expiresAt: "2026-09-26T12:00:00Z" },
    { role: "VIEWER", createdAt: "2026-09-19T13:00:00Z", expiresAt: "2026-09-26T13:00:00Z" },
  ];
  fetchMock.mockResolvedValue(new Response(JSON.stringify(groups), { status: 200 }));
  await expect(fetchCourseInviteGroups(12)).resolves.toEqual(groups);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("http://localhost:8080/api/v1/courses/12/invite-groups", { credentials: "include" });
});

it("권한별 초대 조회는 인증 만료와 권한 거부를 구분하고 내부 오류를 숨긴다", async () => {
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
  await expect(fetchCourseInviteGroups(12)).rejects.toBeInstanceOf(UnauthorizedError);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));
  await expect(fetchCourseInviteGroups(12)).rejects.toBeInstanceOf(CourseAccessError);
  fetchMock.mockResolvedValueOnce(new Response("<html>internal SQL error</html>", { status: 500 }));
  await expect(fetchCourseInviteGroups(12)).rejects.toThrow("사용 가능한 초대 링크를 불러오지 못했습니다.");
});
