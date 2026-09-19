import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SignupPage from "./signup-page";
import { checkEmailAvailability, checkUsernameAvailability, isUserApiConfigured, signUp, type SignUpResponse } from "@/services/user";
import { confirmPhoneVerification, requestPhoneVerification, type PhoneConfirmation } from "@/services/phone-verification";

vi.mock("@/services/user");
vi.mock("@/services/phone-verification", async (original) => ({ ...await original<typeof import("@/services/phone-verification")>(), requestPhoneVerification: vi.fn(), confirmPhoneVerification: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isUserApiConfigured).mockReturnValue(true);
  vi.mocked(checkUsernameAvailability).mockResolvedValue({ available: true, message: "사용 가능한 아이디입니다." });
  vi.mocked(checkEmailAvailability).mockResolvedValue({ available: true, message: "사용 가능한 이메일입니다." });
  vi.mocked(requestPhoneVerification).mockResolvedValue({ challengeId: "signup-challenge", expiresIn: 300, resendAfter: 60 });
  vi.mocked(confirmPhoneVerification).mockResolvedValue({ purpose: "SIGNUP", verificationToken: "verified-phone-receipt" });
  vi.mocked(signUp).mockResolvedValue({} as SignUpResponse);
});
afterEach(() => vi.useRealTimers());

async function setup() {
  render(<MemoryRouter initialEntries={["/signup"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/signup" element={<SignupPage />} /><Route path="/login" element={<p>가입 후 로그인 화면</p>} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "traveler01" } });
  await act(async () => fireEvent.click(within(screen.getByLabelText("아이디").parentElement!).getByRole("button", { name: "중복 확인" })));
  fireEvent.change(screen.getByLabelText("이름"), { target: { value: "홍길동" } });
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "user@example.com" } });
  await act(async () => fireEvent.click(within(screen.getByLabelText("이메일").parentElement!).getByRole("button", { name: "중복 확인" })));
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "Password1!" } });
  fireEvent.change(screen.getByLabelText("비밀번호 확인"), { target: { value: "Password1!" } });
}
async function requestCode() {
  fireEvent.change(screen.getByLabelText("휴대폰번호 (선택)"), { target: { value: "01012345678" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 받기" })));
}
async function verifyCode() {
  fireEvent.change(screen.getByLabelText("인증번호"), { target: { value: "123456" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 확인" })));
}

test("회원가입에 문자 인증 증명만 제출하고 완료 후 로그인으로 연결한다", async () => {
  vi.useFakeTimers(); await setup(); await requestCode(); await verifyCode();
  await act(async () => fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" })));
  expect(requestPhoneVerification).toHaveBeenCalledWith({ purpose: "SIGNUP", phoneNumber: "01012345678" });
  expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ phoneVerificationToken: "verified-phone-receipt" }));
  expect(vi.mocked(signUp).mock.calls[0][0]).not.toHaveProperty("phoneNumber");
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(screen.getByText("가입 후 로그인 화면")).toBeInTheDocument();
});

test("번호 입력 후 미인증이거나 인증 뒤 번호를 바꾸면 가입을 막는다", async () => {
  await setup(); await requestCode();
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));
  expect(screen.getByRole("alert")).toHaveTextContent("입력한 휴대폰번호의 인증을 완료하거나 번호를 지워 주세요.");
  expect(signUp).not.toHaveBeenCalled();
  await verifyCode();
  fireEvent.change(screen.getByLabelText("휴대폰번호 (선택)"), { target: { value: "01087654321" } });
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));
  expect(signUp).not.toHaveBeenCalled();
  expect(screen.queryByText("휴대폰 인증이 완료되었습니다.")).not.toBeInTheDocument();
});

test("바뀐 번호에 이전의 늦은 인증 결과를 붙여 회원가입할 수 없다", async () => {
  let resolve!: (value: PhoneConfirmation) => void;
  vi.mocked(confirmPhoneVerification).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await setup(); await requestCode();
  fireEvent.change(screen.getByLabelText("인증번호"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "인증번호 확인" }));
  fireEvent.change(screen.getByLabelText("휴대폰번호 (선택)"), { target: { value: "01087654321" } });
  await act(async () => resolve({ purpose: "SIGNUP", verificationToken: "old-token" }));
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));
  expect(signUp).not.toHaveBeenCalled();
});

test("선택 번호를 지우면 인증 증명 없이 가입할 수 있다", async () => {
  vi.useFakeTimers(); await setup(); await requestCode();
  fireEvent.change(screen.getByLabelText("휴대폰번호 (선택)"), { target: { value: "" } });
  await act(async () => fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" })));
  expect(signUp).toHaveBeenCalledTimes(1);
  expect(vi.mocked(signUp).mock.calls[0][0]).not.toHaveProperty("phoneVerificationToken");
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
});
