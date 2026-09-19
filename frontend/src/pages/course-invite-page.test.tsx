import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import CourseInvitePage from "./course-invite-page";
import {
  acceptCourseInvite,
  CourseInviteError,
  fetchCourseInvite,
  type CourseInviteAcceptResult,
  type CourseInvitePreview,
} from "@/services/course-invites";

vi.mock("@/services/course-invites", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/course-invites")>(),
  fetchCourseInvite: vi.fn(),
  acceptCourseInvite: vi.fn(),
}));

const token = "friend_2026-safe-token";
const otherToken = "another_safe-token";
const preview: CourseInvitePreview = {
  courseId: 42,
  courseTitle: "함께 떠나는 강릉 여행",
  memberRole: "VIEWER",
  expiresAt: "2026-09-20T12:00:00Z",
};
const accepted: CourseInviteAcceptResult = { courseId: 42, joined: true, alreadyMember: false };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function CurrentLocation() {
  const location = useLocation();
  return <output aria-label="현재 경로">{location.pathname}{location.search}</output>;
}

function renderPage({ strict = false, path = `/course-invites/${token}` } = {}) {
  const app = (
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CurrentLocation />
      <Link to={`/course-invites/${otherToken}`}>다른 초대 열기</Link>
      <Routes>
        <Route path="/course-invites/:token?" element={<CourseInvitePage />} />
        <Route path="/courses/:courseId" element={<h1>참여한 코스</h1>} />
        <Route path="/login" element={<h1>로그인 화면</h1>} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{app}</StrictMode> : app);
}

describe("CourseInvitePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchCourseInvite).mockResolvedValue(preview);
    vi.mocked(acceptCourseInvite).mockResolvedValue(accepted);
  });

  it.each([
    ["VIEWER", "읽기 권한으로 참여해요"],
    ["EDITOR", "편집 권한으로 참여해요"],
  ] as const)("%s 초대의 코스명, 권한, 만료일과 수락 버튼을 표시한다", async (memberRole, label) => {
    vi.mocked(fetchCourseInvite).mockResolvedValue({ ...preview, memberRole });
    renderPage();

    expect(await screen.findByRole("heading", { name: preview.courseTitle })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    expect(screen.getByText(/2026년 9월 20일/)).toHaveAttribute("dateTime", preview.expiresAt);
    expect(screen.getByRole("button", { name: "초대 수락하고 참여하기" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", `/signup?${new URLSearchParams({ returnTo: `/course-invites/${token}` })}`);
    expect(acceptCourseInvite).not.toHaveBeenCalled();
  });

  it("StrictMode의 재마운트와 미리보기 조회는 수락 요청을 보내지 않는다", async () => {
    renderPage({ strict: true });

    await screen.findByRole("heading", { name: preview.courseTitle });
    expect(fetchCourseInvite).toHaveBeenCalledWith(token, expect.any(AbortSignal));
    expect(acceptCourseInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하고 참여하기" }));
    await screen.findByRole("heading", { name: "참여한 코스" });
    expect(acceptCourseInvite).toHaveBeenCalledExactlyOnceWith(token);
  });

  it.each([
    ["새 참여", accepted],
    ["이미 참여한 사용자", { courseId: 42, joined: false, alreadyMember: true }],
  ])("%s 수락 결과는 해당 코스로 이동한다", async (_label, result) => {
    vi.mocked(acceptCourseInvite).mockResolvedValue(result as CourseInviteAcceptResult);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));

    await screen.findByRole("heading", { name: "참여한 코스" });
    expect(screen.getByLabelText("현재 경로")).toHaveTextContent(/^\/courses\/42$/);
  });

  it("수락 중 중복 클릭을 잠그고 응답이 올 때까지 한 번만 요청한다", async () => {
    const request = deferred<CourseInviteAcceptResult>();
    vi.mocked(acceptCourseInvite).mockReturnValue(request.promise);
    renderPage();
    const button = await screen.findByRole("button", { name: "초대 수락하고 참여하기" });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "참여하는 중..." })).toBeDisabled();
    expect(acceptCourseInvite).toHaveBeenCalledExactlyOnceWith(token);

    await act(async () => request.resolve(accepted));
    expect(screen.getByLabelText("현재 경로")).toHaveTextContent(/^\/courses\/42$/);
  });

  it("수락 401은 초대 경로를 returnTo에 보존해서 로그인으로 이동한다", async () => {
    vi.mocked(acceptCourseInvite).mockRejectedValue(new CourseInviteError(401, "인증 필요"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));

    await screen.findByRole("heading", { name: "로그인 화면" });
    const currentUrl = new URL(screen.getByLabelText("현재 경로").textContent!, "http://localhost");
    expect(currentUrl.pathname).toBe("/login");
    expect(currentUrl.searchParams.get("returnTo")).toBe(`/course-invites/${token}`);
  });

  it("수락 403은 로그인으로 이동하지 않고 권한 오류를 표시한다", async () => {
    vi.mocked(acceptCourseInvite).mockRejectedValue(new CourseInviteError(403, "참여 불가"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("새 초대가 필요해요");
    expect(screen.getByLabelText("현재 경로")).toHaveTextContent(`/course-invites/${token}`);
    expect(screen.queryByRole("heading", { name: "로그인 화면" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "초대 수락하고 참여하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  it.each([
    [400, "초대 기간이 지났어요"],
    [404, "사용할 수 없는 초대예요"],
  ])("초기 조회 %i는 초대 오류를 표시하고 수락을 허용하지 않는다", async (status, title) => {
    vi.mocked(fetchCourseInvite).mockRejectedValue(new CourseInviteError(status, "사용 불가"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(title);
    expect(screen.queryByRole("button", { name: "초대 수락하고 참여하기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(acceptCourseInvite).not.toHaveBeenCalled();
  });

  it.each([
    [400, "초대 기간이 지났어요"],
    [404, "사용할 수 없는 초대예요"],
  ])("미리보기를 연 뒤 수락 %i가 발생하면 더 이상 참여할 수 없음을 표시한다", async (status, title) => {
    vi.mocked(acceptCourseInvite).mockRejectedValue(new CourseInviteError(status, "사용 불가"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(title);
    expect(screen.queryByRole("button", { name: "초대 수락하고 참여하기" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("현재 경로")).toHaveTextContent(`/course-invites/${token}`);
  });

  it("조회 네트워크 실패는 명시적인 재시도로 복구하며 자동 수락하지 않는다", async () => {
    vi.mocked(fetchCourseInvite)
      .mockRejectedValueOnce(new CourseInviteError(0, "연결 실패"))
      .mockResolvedValueOnce(preview);
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("초대 정보를 불러오지 못했어요");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await screen.findByRole("heading", { name: preview.courseTitle });
    expect(fetchCourseInvite).toHaveBeenCalledTimes(2);
    expect(acceptCourseInvite).not.toHaveBeenCalled();
  });

  it("수락 네트워크 실패 후 버튼을 다시 눌러 참여할 수 있다", async () => {
    vi.mocked(acceptCourseInvite)
      .mockRejectedValueOnce(new CourseInviteError(0, "연결 실패"))
      .mockResolvedValueOnce(accepted);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("초대를 수락하지 못했어요.");
    const retryButton = screen.getByRole("button", { name: "초대 수락하고 참여하기" });
    expect(retryButton).toBeEnabled();
    fireEvent.click(retryButton);

    await screen.findByRole("heading", { name: "참여한 코스" });
    expect(acceptCourseInvite).toHaveBeenCalledTimes(2);
  });

  it("다른 토큰으로 이동하면 이전 미리보기 응답을 무시한다", async () => {
    const oldRequest = deferred<CourseInvitePreview>();
    vi.mocked(fetchCourseInvite)
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ ...preview, courseId: 77, courseTitle: "새 초대의 여행" });
    renderPage();
    fireEvent.click(screen.getByRole("link", { name: "다른 초대 열기" }));
    await screen.findByRole("heading", { name: "새 초대의 여행" });
    await act(async () => oldRequest.resolve(preview));

    expect(screen.queryByRole("heading", { name: preview.courseTitle })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "새 초대의 여행" })).toBeInTheDocument();
    expect(vi.mocked(fetchCourseInvite).mock.calls[0][1]?.aborted).toBe(true);
    expect(acceptCourseInvite).not.toHaveBeenCalled();
  });

  it("다른 토큰으로 이동한 뒤 이전 수락 성공이 새 화면을 이동시키지 않는다", async () => {
    const oldRequest = deferred<CourseInviteAcceptResult>();
    vi.mocked(acceptCourseInvite).mockReturnValueOnce(oldRequest.promise);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));
    fireEvent.click(screen.getByRole("link", { name: "다른 초대 열기" }));
    await screen.findByRole("button", { name: "초대 수락하고 참여하기" });
    await act(async () => oldRequest.resolve(accepted));

    expect(screen.getByLabelText("현재 경로")).toHaveTextContent(`/course-invites/${otherToken}`);
    expect(screen.queryByRole("heading", { name: "참여한 코스" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초대 수락하고 참여하기" })).toBeEnabled();
  });

  it("다른 토큰으로 이동한 뒤 이전 수락 401이 로그인으로 보내지 않는다", async () => {
    const oldRequest = deferred<CourseInviteAcceptResult>();
    vi.mocked(acceptCourseInvite).mockReturnValueOnce(oldRequest.promise);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));
    fireEvent.click(screen.getByRole("link", { name: "다른 초대 열기" }));
    await screen.findByRole("button", { name: "초대 수락하고 참여하기" });
    await act(async () => oldRequest.reject(new CourseInviteError(401, "인증 필요")));

    expect(screen.getByLabelText("현재 경로")).toHaveTextContent(`/course-invites/${otherToken}`);
    expect(screen.queryByRole("heading", { name: "로그인 화면" })).not.toBeInTheDocument();
  });

  it("토큰이 빠진 링크는 서버 요청 없이 오류를 표시한다", async () => {
    renderPage({ path: "/course-invites" });

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("사용할 수 없는 초대예요"));
    expect(fetchCourseInvite).not.toHaveBeenCalled();
    expect(acceptCourseInvite).not.toHaveBeenCalled();
  });
});
