import { StrictMode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import FindIdPage from "./find-id-page";
import ForgotPasswordPage from "./forgot-password-page";
import ResetPasswordPage from "./reset-password-page";
import LoginPage from "./login-page";
import PhoneVerification from "@/components/ui/phone-verification";
import { confirmPhoneVerification, requestPhoneVerification, PhoneVerificationError, phoneUnavailableMessage, type PhoneConfirmation } from "@/services/phone-verification";
import { confirmPasswordReset, requestPasswordReset } from "@/services/password-reset";

vi.mock("@/services/phone-verification", async (original) => ({ ...await original<typeof import("@/services/phone-verification")>(), requestPhoneVerification: vi.fn(), confirmPhoneVerification: vi.fn() }));
vi.mock("@/services/password-reset", async (original) => ({ ...await original<typeof import("@/services/password-reset")>(), requestPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() }));

function Path() { const p = useLocation(); return <output data-testid="path">{p.pathname}{p.search}{p.hash}</output>; }
function renderFlow(path = "/find-id") {
  return render(<StrictMode><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Path /><Routes>
    <Route path="/find-id" element={<FindIdPage />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} />
    <Route path="/reset-password" element={<ResetPasswordPage />} /><Route path="/login" element={<LoginPage />} />
  </Routes></MemoryRouter></StrictMode>);
}
async function requestCode() {
  fireEvent.change(screen.getByLabelText("휴대폰번호"), { target: { value: "010-1234-5678" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 받기" })));
}
async function confirmCode(code = "123456") {
  fireEvent.change(screen.getByLabelText("인증번호"), { target: { value: code } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 확인" })));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requestPhoneVerification).mockReset().mockResolvedValue({ challengeId: "challenge-1", expiresIn: 300, resendAfter: 60 });
  vi.mocked(confirmPhoneVerification).mockReset().mockResolvedValue({ purpose: "FIND_ID", loginId: "traveler01", passwordResetToken: "phone-reset-token" });
  vi.mocked(confirmPasswordReset).mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

test("인증 전에는 아이디를 노출하지 않고 인증 후 아이디와 로그인 연결을 제공한다", async () => {
  renderFlow("/find-id?returnTo=%2Fcourse-invites%2Ftoken-1");
  expect(screen.getByText(/아직 번호를 등록하지 않았다면 아이디 찾기는 이용할 수 없습니다/)).toBeInTheDocument();
  expect(screen.queryByText("traveler01")).not.toBeInTheDocument();
  await requestCode();
  expect(requestPhoneVerification).toHaveBeenCalledWith({ purpose: "FIND_ID", phoneNumber: "01012345678" });
  expect(screen.queryByText("traveler01")).not.toBeInTheDocument();
  await confirmCode();
  expect(confirmPhoneVerification).toHaveBeenCalledWith({ challengeId: "challenge-1", code: "123456" });
  expect(screen.getByText("traveler01")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "이 아이디로 로그인" }));
  expect(screen.getByLabelText("아이디")).toHaveValue("traveler01");
  expect(screen.getByTestId("path")).toHaveTextContent("returnTo=%2Fcourse-invites%2Ftoken-1");
});

test("아이디 찾기 후 인증된 계정의 비밀번호를 변경하고 안전한 초대로 복귀한다", async () => {
  renderFlow("/find-id?returnTo=%2Fcourse-invites%2Ftoken-1");
  await requestCode(); await confirmCode();
  fireEvent.click(screen.getByRole("link", { name: "이 계정의 비밀번호 재설정" }));
  expect(screen.getByTestId("path")).toHaveTextContent(/^\/reset-password$/);
  fireEvent.change(screen.getByLabelText("새 비밀번호"), { target: { value: "NewPassword1!" } });
  fireEvent.change(screen.getByLabelText("새 비밀번호 확인"), { target: { value: "NewPassword1!" } });
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(confirmPasswordReset).toHaveBeenCalledWith({ token: "phone-reset-token", password: "NewPassword1!" });
  expect(screen.getByRole("heading", { name: "비밀번호 변경 완료" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "로그인으로 돌아가기" })).toHaveAttribute("href", "/login?returnTo=%2Fcourse-invites%2Ftoken-1");
});

test("휴대폰으로 비밀번호를 찾을 때 입력한 아이디에 결합된 인증을 요청한다", async () => {
  vi.mocked(confirmPhoneVerification).mockResolvedValue({ purpose: "RESET_PASSWORD", passwordResetToken: "reset-2" });
  renderFlow("/forgot-password");
  fireEvent.click(screen.getByRole("button", { name: "휴대폰으로 찾기" }));
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: " traveler01 " } });
  await requestCode(); await confirmCode();
  expect(requestPhoneVerification).toHaveBeenCalledWith({ purpose: "RESET_PASSWORD", phoneNumber: "01012345678", loginId: "traveler01" });
  expect(screen.getByRole("heading", { name: "새 비밀번호 설정" })).toBeInTheDocument();
});

test("잘못된 인증번호는 아이디나 재설정 권한을 제공하지 않고 재시도 가능하다", async () => {
  vi.mocked(confirmPhoneVerification).mockRejectedValueOnce(new Error("인증번호가 일치하지 않습니다."));
  renderFlow(); await requestCode(); await confirmCode("000000");
  expect(screen.getByRole("alert")).toHaveTextContent("인증번호가 일치하지 않습니다.");
  expect(screen.queryByText("traveler01")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "이 계정의 비밀번호 재설정" })).not.toBeInTheDocument();
  await confirmCode();
  expect(screen.getByText("traveler01")).toBeInTheDocument();
});

test.each(["등록된 휴대폰번호가 없습니다.", phoneUnavailableMessage])("발송 실패를 성공으로 표시하지 않는다: %s", async (message) => {
  vi.mocked(requestPhoneVerification).mockRejectedValue(new Error(message));
  renderFlow(); await requestCode();
  expect(screen.getByRole("alert")).toHaveTextContent(message);
  expect(screen.queryByLabelText("인증번호")).not.toBeInTheDocument();
  expect(screen.queryByText(/인증번호를 발송했습니다/)).not.toBeInTheDocument();
  expect(confirmPhoneVerification).not.toHaveBeenCalled();
});

test("60초 재발송 제한과 5분 만료를 지키고 새 인증으로만 재시도한다", async () => {
  vi.useFakeTimers(); renderFlow(); await requestCode();
  expect(screen.getByRole("button", { name: "다시 보내기 (60초 후)" })).toBeDisabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(screen.getByRole("button", { name: "인증번호 다시 보내기" })).toBeEnabled();
  await act(async () => { await vi.advanceTimersByTimeAsync(240_000); });
  expect(screen.getByText("인증번호가 만료되었습니다. 인증번호를 다시 받아 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "인증번호 확인" })).toBeDisabled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 다시 보내기" })));
  expect(requestPhoneVerification).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "인증번호 확인" })).toBeEnabled();
});

test("서버에서 만료 또는 시도 횟수 초과를 알리면 기존 인증번호 확인을 막는다", async () => {
  vi.mocked(confirmPhoneVerification).mockRejectedValue(new PhoneVerificationError("인증 횟수를 초과했습니다. 다시 받아 주세요.", 0, true));
  renderFlow(); await requestCode(); await confirmCode();
  expect(screen.getByRole("button", { name: "인증번호 확인" })).toBeDisabled();
  expect(screen.queryByText("traveler01")).not.toBeInTheDocument();
});

test("번호를 바꾼 뒤 도착한 이전 인증 응답은 새 번호를 인증하지 않는다", async () => {
  let resolve!: (value: PhoneConfirmation) => void;
  vi.mocked(confirmPhoneVerification).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const onVerified = vi.fn();
  render(<PhoneVerification purpose="SIGNUP" onVerified={onVerified} />);
  await requestCode();
  fireEvent.change(screen.getByLabelText("인증번호"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "인증번호 확인" }));
  fireEvent.change(screen.getByLabelText("휴대폰번호"), { target: { value: "01098765432" } });
  await act(async () => resolve({ purpose: "SIGNUP", verificationToken: "old-proof" }));
  expect(onVerified).not.toHaveBeenCalledWith(expect.objectContaining({ verificationToken: "old-proof" }));
  expect(screen.queryByText("휴대폰 인증이 완료되었습니다.")).not.toBeInTheDocument();
});

test("이메일 불일치는 명시적으로 안내하고 발송 성공을 표시하지 않는다", async () => {
  vi.mocked(requestPasswordReset).mockRejectedValue(new Error("아이디 또는 이메일이 일치하지 않습니다."));
  renderFlow("/forgot-password");
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "traveler01" } });
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "wrong@example.com" } });
  await act(async () => fireEvent.submit(screen.getByRole("form")));
  expect(screen.getByRole("alert")).toHaveTextContent("아이디 또는 이메일이 일치하지 않습니다.");
  expect(screen.queryByText("메일함을 확인해 주세요")).not.toBeInTheDocument();
});

test("외부 복귀 경로와 유효하지 않은 로그인 아이디 미리 입력을 거부한다", () => {
  renderFlow("/login?returnTo=https%3A%2F%2Fevil.example&loginId=INVALID!");
  expect(screen.getByLabelText("아이디")).toHaveValue("");
  expect(screen.getByRole("link", { name: "아이디 찾기" })).toHaveAttribute("href", "/find-id");
});

test.each(["0101234567", "01112345678", "0212345678"])("지원하지 않는 번호는 서버에 발송을 요청하지 않는다: %s", async (phoneNumber) => {
  renderFlow();
  fireEvent.change(screen.getByLabelText("휴대폰번호"), { target: { value: phoneNumber } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 받기" })));
  expect(screen.getByRole("alert")).toHaveTextContent("010으로 시작하는 휴대폰번호 11자리를 입력해 주세요.");
  expect(requestPhoneVerification).not.toHaveBeenCalled();
});
