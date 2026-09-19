import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { confirmPasswordReset, invalidPasswordResetLinkMessage, PasswordResetError, passwordResetUnavailableMessage, requestPasswordReset } from "@/services/password-reset";
import ForgotPasswordPage from "./forgot-password-page";
import LoginPage from "./login-page";
import ResetPasswordPage from "./reset-password-page";

vi.mock("@/services/password-reset", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/password-reset")>(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="current-path">{location.pathname}{location.search}{location.hash}</div>;
}

function renderFlow(path: string, reopenedToken?: string) {
  return render(<StrictMode><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <CurrentPath />
    {reopenedToken && <Link to={`/reset-password#token=${reopenedToken}`}>메일 링크 다시 열기</Link>}
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Routes>
  </MemoryRouter></StrictMode>);
}

function fillRequest() {
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "testuser1" } });
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "user@example.com" } });
}

function fillPassword(password = "NewPassword1!", confirmation = password) {
  fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: confirmation } });
}

beforeEach(() => {
  vi.mocked(requestPasswordReset).mockReset().mockResolvedValue(undefined);
  vi.mocked(confirmPasswordReset).mockReset().mockResolvedValue(undefined);
  sessionStorage.clear();
});

afterEach(() => { vi.useRealTimers(); });

test("로그인의 비밀번호 찾기 링크와 복귀 링크는 안전한 초대 경로를 유지한다", () => {
  const first = renderFlow("/login?returnTo=%2Fcourse-invites%2Finvite-token");
  expect(screen.getByRole("link", { name: "비밀번호를 잊으셨나요?" })).toHaveAttribute("href", "/forgot-password?returnTo=%2Fcourse-invites%2Finvite-token");
  first.unmount();
  renderFlow("/forgot-password?returnTo=%2Fcourse-invites%2Finvite-token");
  expect(screen.getByRole("link", { name: "로그인으로 돌아가기" })).toHaveAttribute("href", "/login?returnTo=%2Fcourse-invites%2Finvite-token");
  fireEvent.click(screen.getByRole("link", { name: "로그인으로 돌아가기" }));
  expect(screen.getByTestId("current-path")).toHaveTextContent("/login?returnTo=%2Fcourse-invites%2Finvite-token");
});

test("외부 복귀 주소는 무시한다", () => {
  renderFlow("/forgot-password?returnTo=https%3A%2F%2Fevil.example");
  expect(screen.getByRole("link", { name: "로그인으로 돌아가기" })).toHaveAttribute("href", "/login");
});

test("잘못된 아이디와 이메일은 요청 전에 검사한다", () => {
  renderFlow("/forgot-password");
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "x" } });
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "wrong" } });
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByText("영문 소문자와 숫자로 6~20자로 입력해 주세요.")).toBeInTheDocument();
  expect(screen.getByText("올바른 이메일 주소를 입력해 주세요.")).toBeInTheDocument();
  expect(requestPasswordReset).not.toHaveBeenCalled();
});

test("메일 발송이 성공하면 명확히 안내하고 60초 뒤 재전송할 수 있다", async () => {
  vi.useFakeTimers();
  renderFlow("/forgot-password");
  fillRequest();
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(requestPasswordReset).toHaveBeenCalledWith({ loginId: "testuser1", email: "user@example.com" });
  expect(screen.getByRole("status")).toHaveTextContent("비밀번호 재설정 메일을 발송했습니다.");
  expect(screen.getByRole("button", { name: "다시 보내기 (60초 후)" })).toBeDisabled();
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(requestPasswordReset).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  fireEvent.click(screen.getByRole("button", { name: "재설정 메일 다시 보내기" }));
  await act(async () => {});
  expect(requestPasswordReset).toHaveBeenCalledTimes(2);
});

test("발송 중 중복 요청을 막고 서비스 실패는 성공으로 표시하지 않는다", async () => {
  let rejectRequest!: (reason: Error) => void;
  vi.mocked(requestPasswordReset).mockImplementation(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
  renderFlow("/forgot-password");
  fillRequest();
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("button", { name: "요청 중..." })).toBeDisabled();
  await act(async () => rejectRequest(new Error(passwordResetUnavailableMessage)));
  expect(screen.getByRole("alert")).toHaveTextContent(passwordResetUnavailableMessage);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "재설정 메일 보내기" })).toBeEnabled();
});

test("StrictMode에서 fragment를 즉시 지워도 토큰을 메모리에 보존하고 변경을 완료한다", async () => {
  renderFlow("/reset-password#token=private-reset-token");
  expect(screen.getByTestId("current-path")).toHaveTextContent(/^\/reset-password$/);
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
  fillPassword();
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(confirmPasswordReset).toHaveBeenCalledWith({ token: "private-reset-token", password: "NewPassword1!" });
  expect(screen.getByRole("heading", { name: "비밀번호 변경 완료" })).toBeInTheDocument();
  expect(screen.queryByLabelText("새 비밀번호")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "로그인으로 돌아가기" }));
  expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
});

test.each(["/reset-password", "/reset-password?token=query-token", "/reset-password#token="])("토큰이 없으면 새 메일을 요청하도록 안내한다: %s", (path) => {
  renderFlow(path);
  expect(screen.getByRole("alert")).toHaveTextContent(invalidPasswordResetLinkMessage);
  expect(screen.queryByLabelText("새 비밀번호")).not.toBeInTheDocument();
  expect(screen.getByTestId("current-path")).toHaveTextContent(/^\/reset-password$/);
  fireEvent.click(screen.getByRole("link", { name: "재설정 메일 다시 요청하기" }));
  expect(screen.getByRole("heading", { name: "비밀번호 찾기" })).toBeInTheDocument();
  expect(confirmPasswordReset).not.toHaveBeenCalled();
});

test("새로고침으로 토큰을 잃으면 메일 링크를 다시 여는 방법을 안내한다", () => {
  const first = renderFlow("/reset-password#token=private-reset-token");
  const refreshedPath = screen.getByTestId("current-path").textContent!;
  first.unmount();
  renderFlow(refreshedPath);
  expect(screen.getByText("화면을 새로고침했다면 메일의 링크를 다시 열어 주세요.")).toBeInTheDocument();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

test.each(["토큰 없음", "만료", "변경 완료", "입력 중"])("같은 화면에서 메일 링크를 다시 열면 새 토큰으로 설정을 시작한다: %s", async (previousState) => {
  renderFlow(previousState === "토큰 없음" ? "/reset-password" : "/reset-password#token=old-token", "reopened-token");
  if (previousState !== "토큰 없음") {
    fillPassword();
    if (previousState === "만료") {
      vi.mocked(confirmPasswordReset).mockRejectedValueOnce(new PasswordResetError(invalidPasswordResetLinkMessage, true));
    }
    if (previousState !== "입력 중") {
      await act(async () => fireEvent.submit(screen.getByRole("form")));
    }
  }
  fireEvent.click(screen.getByRole("link", { name: "메일 링크 다시 열기" }));
  expect(screen.getByTestId("current-path")).toHaveTextContent(/^\/reset-password$/);
  expect(screen.getByLabelText("새 비밀번호")).toHaveValue("");
  expect(screen.getByLabelText("새 비밀번호 확인")).toHaveValue("");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  fillPassword("ReopenedPassword1!");
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(confirmPasswordReset).toHaveBeenLastCalledWith({ token: "reopened-token", password: "ReopenedPassword1!" });
  expect(screen.getByRole("heading", { name: "비밀번호 변경 완료" })).toBeInTheDocument();
});

test("이전 토큰의 변경 요청이 늦게 완료되어도 새로 연 링크를 덮어쓰지 않는다", async () => {
  let finishPreviousRequest!: () => void;
  vi.mocked(confirmPasswordReset).mockImplementationOnce(() => new Promise((resolve) => { finishPreviousRequest = resolve; }));
  renderFlow("/reset-password#token=old-token", "reopened-token");
  fillPassword();
  fireEvent.submit(screen.getByRole("form"));
  expect(screen.getByRole("button", { name: "변경 중..." })).toBeDisabled();
  fireEvent.click(screen.getByRole("link", { name: "메일 링크 다시 열기" }));
  fillPassword("ReopenedPassword1!");
  await act(async () => finishPreviousRequest());
  expect(screen.getByLabelText("새 비밀번호")).toHaveValue("ReopenedPassword1!");
  expect(screen.getByRole("button", { name: "비밀번호 변경하기" })).toBeEnabled();
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(confirmPasswordReset).toHaveBeenLastCalledWith({ token: "reopened-token", password: "ReopenedPassword1!" });
});

test.each(["short1A", "alllowercase1", "NoDigitsHere", "Space Pass1", "한글Password1"])("비밀번호 정책을 검사한다: %s", async (password) => {
  renderFlow("/reset-password#token=private-reset-token");
  fillPassword(password);
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(screen.getByLabelText("새 비밀번호")).toHaveAttribute("aria-invalid", "true");
  expect(confirmPasswordReset).not.toHaveBeenCalled();
});

test("비밀번호 확인이 다르면 변경을 요청하지 않는다", async () => {
  renderFlow("/reset-password#token=private-reset-token");
  fillPassword("NewPassword1!", "Different1!");
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(screen.getByRole("alert")).toHaveTextContent("비밀번호가 일치하지 않습니다.");
  expect(confirmPasswordReset).not.toHaveBeenCalled();
});

test("사용했거나 만료된 토큰이면 재설정 요청 링크를 표시한다", async () => {
  vi.mocked(confirmPasswordReset).mockRejectedValue(new PasswordResetError(invalidPasswordResetLinkMessage, true));
  renderFlow("/reset-password#token=used-token");
  fillPassword();
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(screen.getByRole("alert")).toHaveTextContent(invalidPasswordResetLinkMessage);
  expect(screen.getByRole("link", { name: "재설정 메일 다시 요청하기" })).toHaveAttribute("href", "/forgot-password");
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

test("일시적인 변경 실패는 토큰을 유지해 다시 시도할 수 있다", async () => {
  vi.mocked(confirmPasswordReset).mockRejectedValueOnce(new Error("서버 연결 실패"));
  renderFlow("/reset-password#token=private-reset-token");
  fillPassword();
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(screen.getByRole("alert")).toHaveTextContent("서버 연결 실패");
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(confirmPasswordReset).toHaveBeenLastCalledWith({ token: "private-reset-token", password: "NewPassword1!" });
  expect(screen.getByRole("heading", { name: "비밀번호 변경 완료" })).toBeInTheDocument();
});
