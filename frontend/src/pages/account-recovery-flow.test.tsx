import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import FindIdPage from "./find-id-page";
import ForgotPasswordPage from "./forgot-password-page";
import ResetPasswordPage from "./reset-password-page";
import LoginPage from "./login-page";
import { IdRecoveryError, idRecoveryEmailMismatchMessage, idRecoveryUnavailableMessage, requestIdRecovery } from "@/services/id-recovery";
import { confirmPasswordReset, requestPasswordReset } from "@/services/password-reset";

vi.mock("@/services/id-recovery", async (original) => ({ ...await original<typeof import("@/services/id-recovery")>(), requestIdRecovery: vi.fn() }));
vi.mock("@/services/password-reset", async (original) => ({ ...await original<typeof import("@/services/password-reset")>(), requestPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() }));

function Path() { const p = useLocation(); return <div data-testid="path">{p.pathname}{p.search}{p.hash}</div>; }
function renderFlow(path = "/find-id") {
  return render(<StrictMode><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Path /><Routes>
    <Route path="/find-id" element={<FindIdPage />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/login" element={<LoginPage />} />
  </Routes></MemoryRouter></StrictMode>);
}
async function submitEmail(email = "user@example.com") {
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: email } });
  await act(async () => fireEvent.submit(screen.getByRole("form", { name: "아이디 안내 메일 요청" })));
}
beforeEach(() => {
  vi.mocked(requestIdRecovery).mockReset().mockResolvedValue(undefined);
  vi.mocked(requestPasswordReset).mockReset().mockResolvedValue(undefined);
  vi.mocked(confirmPasswordReset).mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

test("가입 이메일로 아이디 안내를 요청하고 화면에는 계정 아이디를 표시하지 않는다", async () => {
  renderFlow();
  await submitEmail(" user@example.com ");
  expect(requestIdRecovery).toHaveBeenCalledWith({ email: "user@example.com" });
  expect(screen.getByRole("status")).toHaveTextContent("가입한 이메일로 아이디 안내를 보냈습니다. 메일함을 확인해 주세요.");
  expect(screen.queryByLabelText("아이디")).not.toBeInTheDocument();
  expect(screen.queryByText("등록된 아이디입니다")).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/휴대폰/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText("인증번호")).not.toBeInTheDocument();
});

test("로그인→아이디 찾기→비밀번호 찾기를 안전한 초대 복귀 경로로 연결한다", async () => {
  const first = renderFlow("/login?returnTo=%2Fcourse-invites%2Finvite-1");
  expect(screen.getByRole("link", { name: "아이디 찾기" })).toHaveAttribute("href", "/find-id?returnTo=%2Fcourse-invites%2Finvite-1");
  first.unmount();
  renderFlow("/find-id?returnTo=%2Fcourse-invites%2Finvite-1");
  await submitEmail();
  expect(screen.getByRole("link", { name: "로그인으로 돌아가기" })).toHaveAttribute("href", "/login?returnTo=%2Fcourse-invites%2Finvite-1");
  fireEvent.click(screen.getByRole("link", { name: "비밀번호도 모르겠어요 · 비밀번호 찾기" }));
  expect(screen.getByRole("heading", { name: "비밀번호 찾기" })).toBeInTheDocument();
  expect(screen.getByTestId("path")).toHaveTextContent("/forgot-password?returnTo=%2Fcourse-invites%2Finvite-1");
  expect(screen.getByRole("link", { name: "아이디를 모르겠어요 · 아이디 찾기" })).toHaveAttribute("href", "/find-id?returnTo=%2Fcourse-invites%2Finvite-1");
  expect(screen.queryByRole("button", { name: "휴대폰으로 찾기" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "traveler01" } });
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "user@example.com" } });
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(requestPasswordReset).toHaveBeenCalledWith({ loginId: "traveler01", email: "user@example.com" });
  expect(screen.getByRole("status")).toHaveTextContent("비밀번호 재설정 메일을 발송했습니다.");
});

test.each(["", "incorrect-address"])("잘못된 이메일은 발송 요청 전에 검사한다: %s", async (email) => {
  renderFlow(); await submitEmail(email);
  expect(screen.getByRole("alert")).toHaveTextContent(email ? "올바른 이메일 주소를 입력해 주세요." : "가입할 때 등록한 이메일을 입력해 주세요.");
  expect(requestIdRecovery).not.toHaveBeenCalled();
});

test.each([idRecoveryEmailMismatchMessage, idRecoveryUnavailableMessage, "서버에 연결할 수 없습니다."])("이메일 불일치·발송 실패·연결 실패에는 성공 안내를 표시하지 않는다: %s", async (message) => {
  vi.mocked(requestIdRecovery).mockRejectedValue(new Error(message));
  renderFlow(); await submitEmail();
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByText("가입한 이메일로 아이디 안내를 보냈습니다. 메일함을 확인해 주세요.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "아이디 안내 메일 보내기" })).toBeEnabled();
});

test("발송 중 중복 요청을 차단하고 성공 후 60초가 지나면 다시 보낼 수 있다", async () => {
  vi.useFakeTimers();
  let resolve!: () => void;
  vi.mocked(requestIdRecovery).mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
  renderFlow();
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "user@example.com" } });
  fireEvent.submit(screen.getByRole("form"));
  fireEvent.submit(screen.getByRole("form"));
  expect(requestIdRecovery).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "요청 중..." })).toBeDisabled();
  expect(screen.getByLabelText("이메일")).toBeDisabled();
  await act(async () => resolve());
  expect(screen.getByRole("button", { name: "다시 보내기 (60초 후)" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("form"));
  expect(requestIdRecovery).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "아이디 안내 메일 다시 보내기" })));
  expect(requestIdRecovery).toHaveBeenCalledTimes(2);
});

test("서버 429의 대기 시간을 지키고 성공으로 표시하지 않는다", async () => {
  vi.useFakeTimers();
  vi.mocked(requestIdRecovery).mockRejectedValue(new IdRecoveryError("요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 90));
  renderFlow(); await submitEmail();
  expect(screen.getByRole("alert")).toHaveTextContent("요청이 너무 많습니다.");
  expect(screen.getByRole("button", { name: "다시 보내기 (90초 후)" })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(89_000); });
  expect(screen.getByRole("button", { name: "다시 보내기 (1초 후)" })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
  expect(screen.getByRole("button", { name: "아이디 안내 메일 보내기" })).toBeEnabled();
  expect(screen.queryByText("가입한 이메일로 아이디 안내를 보냈습니다. 메일함을 확인해 주세요.")).not.toBeInTheDocument();
});

test("다른 이메일로 수정하면 이전 성공 안내를 지우고 이전의 늦은 응답도 무시한다", async () => {
  let resolve!: () => void;
  vi.mocked(requestIdRecovery).mockImplementationOnce(() => new Promise<void>((done) => { resolve = done; }));
  renderFlow();
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "first@example.com" } });
  fireEvent.submit(screen.getByRole("form"));
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "second@example.com" } });
  await act(async () => resolve());
  expect(screen.queryByText("가입한 이메일로 아이디 안내를 보냈습니다. 메일함을 확인해 주세요.")).not.toBeInTheDocument();
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(screen.getByRole("status")).toHaveTextContent("가입한 이메일로 아이디 안내를 보냈습니다.");
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "third@example.com" } });
  expect(screen.queryByText("가입한 이메일로 아이디 안내를 보냈습니다. 메일함을 확인해 주세요.")).not.toBeInTheDocument();
});

test("비밀번호 찾기의 아이디와 이메일 불일치도 명시적으로 안내한다", async () => {
  vi.mocked(requestPasswordReset).mockRejectedValue(new Error("아이디 또는 이메일이 일치하지 않습니다."));
  renderFlow("/forgot-password");
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "traveler01" } });
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "wrong@example.com" } });
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(screen.getByRole("alert")).toHaveTextContent("아이디 또는 이메일이 일치하지 않습니다.");
  expect(screen.queryByText("메일함을 확인해 주세요")).not.toBeInTheDocument();
});

test("외부 복귀 경로는 아이디 찾기에서도 제거한다", () => {
  renderFlow("/find-id?returnTo=https%3A%2F%2Fevil.example");
  expect(screen.getByRole("link", { name: "로그인으로 돌아가기" })).toHaveAttribute("href", "/login");
  expect(screen.getByRole("link", { name: "비밀번호도 모르겠어요 · 비밀번호 찾기" })).toHaveAttribute("href", "/forgot-password");
});

test("잘못된 로그인 아이디 미리 입력을 거부한다", () => {
  renderFlow("/login?returnTo=https%3A%2F%2Fevil.example&loginId=INVALID!");
  expect(screen.getByLabelText("아이디")).toHaveValue("");
  expect(screen.getByRole("link", { name: "아이디 찾기" })).toHaveAttribute("href", "/find-id");
});
