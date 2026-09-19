import { act, fireEvent, render, screen } from "@testing-library/react";
import RecoveryPhoneSettings from "./recovery-phone-settings";
import { confirmMyRecoveryPhone, getMyRecoveryPhone, requestMyRecoveryPhone } from "@/services/phone-verification";

vi.mock("@/services/phone-verification", async (original) => ({ ...await original<typeof import("@/services/phone-verification")>(), getMyRecoveryPhone: vi.fn(), requestMyRecoveryPhone: vi.fn(), confirmMyRecoveryPhone: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMyRecoveryPhone).mockResolvedValue({ phoneNumber: null });
  vi.mocked(requestMyRecoveryPhone).mockResolvedValue({ challengeId: "private-challenge", expiresIn: 300, resendAfter: 60 });
  vi.mocked(confirmMyRecoveryPhone).mockResolvedValue({ phoneNumber: "010****5678" });
});
async function setup() {
  render(<RecoveryPhoneSettings />);
  await screen.findByLabelText("현재 비밀번호");
  fireEvent.change(screen.getByLabelText("휴대폰번호"), { target: { value: "01012345678" } });
}

test("비밀번호 확인과 문자 인증 후에만 계정에 등록된 번호를 표시한다", async () => {
  await setup();
  fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "Password1!" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 받기" })));
  expect(requestMyRecoveryPhone).toHaveBeenCalledWith({ phoneNumber: "01012345678", password: "Password1!" });
  expect(screen.queryByText("등록된 휴대폰번호: 010****5678")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("인증번호"), { target: { value: "123456" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 확인" })));
  expect(confirmMyRecoveryPhone).toHaveBeenCalledWith({ challengeId: "private-challenge", code: "123456" });
  expect(screen.getByText("등록된 휴대폰번호: 010****5678")).toBeInTheDocument();
  expect(screen.getByText("계정 복구용 휴대폰번호가 저장되었습니다.")).toBeInTheDocument();
  expect(screen.getByLabelText("현재 비밀번호")).toHaveValue("");
});

test("현재 비밀번호가 없거나 틀리면 문자 발송이나 등록 성공을 표시하지 않는다", async () => {
  await setup();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 받기" })));
  expect(requestMyRecoveryPhone).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("현재 비밀번호를 입력해 주세요.");
  fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "wrong" } });
  vi.mocked(requestMyRecoveryPhone).mockRejectedValue(new Error("현재 비밀번호가 일치하지 않습니다."));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 받기" })));
  expect(screen.getByRole("alert")).toHaveTextContent("현재 비밀번호가 일치하지 않습니다.");
  expect(screen.queryByLabelText("인증번호")).not.toBeInTheDocument();
  expect(confirmMyRecoveryPhone).not.toHaveBeenCalled();
});

test("조회 실패 시 미등록 상태로 오인하지 않고 다시 불러올 수 있다", async () => {
  vi.mocked(getMyRecoveryPhone).mockRejectedValueOnce(new Error("서비스에 연결할 수 없습니다."));
  render(<RecoveryPhoneSettings />);
  expect(await screen.findByRole("alert")).toHaveTextContent("서비스에 연결할 수 없습니다.");
  expect(screen.queryByText(/등록된 휴대폰번호가 없습니다/)).not.toBeInTheDocument();
  expect(screen.queryByLabelText("현재 비밀번호")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "휴대폰 정보 다시 불러오기" }));
  expect(await screen.findByLabelText("현재 비밀번호")).toBeInTheDocument();
});

test("새 번호의 인증 실패 시 기존 등록 번호를 유지한다", async () => {
  vi.mocked(getMyRecoveryPhone).mockResolvedValue({ phoneNumber: "010****1111" });
  vi.mocked(confirmMyRecoveryPhone).mockRejectedValue(new Error("인증번호가 일치하지 않습니다."));
  await setup();
  fireEvent.change(screen.getByLabelText("현재 비밀번호"), { target: { value: "Password1!" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 받기" })));
  fireEvent.change(screen.getByLabelText("인증번호"), { target: { value: "000000" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "인증번호 확인" })));
  expect(screen.getByText("등록된 휴대폰번호: 010****1111")).toBeInTheDocument();
  expect(screen.queryByText("계정 복구용 휴대폰번호가 저장되었습니다.")).not.toBeInTheDocument();
});
