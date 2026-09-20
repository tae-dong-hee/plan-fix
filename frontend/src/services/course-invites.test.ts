import { setApiBaseUrl } from "@/test-utils/env";
import { fetchCourseInviteShareStatus, acceptCourseInvite, CourseInviteError, fetchCourseInvite } from "./course-invites";

describe("course invite service", () => {
  const originalEnv = import.meta.env.VITE_API_BASE_URL;
  const fetchMock = vi.fn();

  beforeEach(() => {
    setApiBaseUrl("http://localhost:8080/api/v1/");
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    setApiBaseUrl(originalEnv);
    vi.unstubAllGlobals();
  });

  it("초대 확인은 토큰을 인코딩한 GET 요청만 보내며 응답과 취소 신호를 전달한다", async () => {
    const preview = {
      courseId: 12,
      courseTitle: "강릉 여행",
      memberRole: "EDITOR",
      expiresAt: "2026-09-18T12:00:00+09:00",
    };
    const controller = new AbortController();
    fetchMock.mockResolvedValue({ ok: true, json: async () => preview });

    await expect(fetchCourseInvite("token/with?special#characters", controller.signal)).resolves.toEqual(preview);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:8080/api/v1/course-invites/token%2Fwith%3Fspecial%23characters",
      { method: "GET", credentials: "include", signal: controller.signal },
    );
  });

  it("전송 확인은 인증 쿠키와 시도 ID를 보내고 캐시를 사용하지 않는다", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ shared: true }) });
    const controller = new AbortController();
    await expect(fetchCourseInviteShareStatus("friend-token", "request-id", controller.signal)).resolves.toEqual({ shared: true });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:8080/api/v1/course-invites/friend-token/kakao-shares/request-id",
      { method: "GET", credentials: "include", cache: "no-store", signal: controller.signal },
    );
  });

  it.each([
    { courseId: 12, joined: true, alreadyMember: false },
    { courseId: 12, joined: false, alreadyMember: true },
  ])("참여 또는 이미 참여한 응답을 그대로 반환한다: %j", async (result) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => result });

    await expect(acceptCourseInvite("invite/token")).resolves.toEqual(result);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:8080/api/v1/course-invites/invite%2Ftoken/accept",
      { method: "POST", credentials: "include" },
    );
  });

  it.each([
    [400, "만료"],
    [401, "로그인"],
    [403, "권한"],
    [404, "취소"],
  ])("%i 오류의 상태를 보존하고 안내를 구분한다", async (status, expectedMessage) => {
    fetchMock.mockResolvedValue({ ok: false, status, json: async () => ({ code: "ERROR" }) });

    const error = await acceptCourseInvite("token").catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(CourseInviteError);
    expect(error).toMatchObject({ status, message: expect.stringContaining(expectedMessage) });
  });

  it("만료 응답에서 JSON message만 읽고 다른 서버 응답 필드는 표시하지 않는다", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: "BAD_REQUEST", message: "만료된 초대 링크입니다.", detail: { token: "private" } }),
    });

    await expect(fetchCourseInvite("token")).rejects.toMatchObject({ status: 400, message: "만료된 초대 링크입니다." });
  });

  it("취소된 초대를 확인하면 404 오류를 반환한다", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: "초대 링크를 찾을 수 없습니다." }) });

    await expect(fetchCourseInvite("token")).rejects.toMatchObject({ status: 404, message: "초대 링크를 찾을 수 없습니다." });
  });

  it.each([null, { message: { detail: "private" } }, { message: " " }])("message가 문자열이 아니거나 비어 있으면 상태별 안내를 사용한다: %j", async (body) => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => body });

    await expect(acceptCourseInvite("token")).rejects.toMatchObject({ status: 403, message: "이 초대에 참여할 권한이 없습니다." });
  });

  it("JSON이 아닌 서버 오류 응답은 일반 안내로 처리한다", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError("<html>proxy error</html>"); } });

    await expect(fetchCourseInvite("token")).rejects.toMatchObject({ status: 502, message: "초대 정보를 불러오지 못했습니다. 다시 시도해 주세요." });
  });

  it("서버 내부 오류 메시지 대신 참여 실패 안내를 표시한다", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: "DatabaseException: private connection details" }) });

    await expect(acceptCourseInvite("token")).rejects.toMatchObject({ status: 500, message: "초대를 수락하지 못했습니다. 다시 시도해 주세요." });
  });

  it.each([undefined, "", "   "])("API가 설정되지 않으면 확인과 수락 모두 실패하고 네트워크를 호출하지 않는다: %j", async (base) => {
    setApiBaseUrl(base);

    await expect(fetchCourseInvite("token")).rejects.toMatchObject({ status: 0 });
    await expect(acceptCourseInvite("token")).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("네트워크 실패는 다시 시도할 수 있는 연결 오류로 구분한다", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(acceptCourseInvite("token")).rejects.toMatchObject({ status: 0, message: expect.stringContaining("연결") });
  });

  it("화면 이동으로 취소한 확인 요청은 AbortError를 그대로 전달한다", async () => {
    const controller = new AbortController();
    const aborted = new DOMException("Aborted", "AbortError");
    controller.abort();
    fetchMock.mockRejectedValue(aborted);

    await expect(fetchCourseInvite("token", controller.signal)).rejects.toBe(aborted);
  });
});
