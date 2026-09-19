import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SignupPage from "./signup-page";
import { checkEmailAvailability, checkUsernameAvailability, isUserApiConfigured, signUp } from "@/services/user";

vi.mock("@/services/user");

const emailButton = () => within(screen.getByLabelText("이메일").parentElement!).getByRole("button", { name: "중복 확인" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isUserApiConfigured).mockReturnValue(true);
  vi.mocked(checkUsernameAvailability).mockResolvedValue({ available: true, message: "사용 가능한 아이디입니다." });
});

function renderPage() {
  render(<MemoryRouter><SignupPage /></MemoryRouter>);
}

async function fillSignupForm(email: string) {
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "traveler01" } });
  fireEvent.click(within(screen.getByLabelText("아이디").parentElement!).getByRole("button", { name: "중복 확인" }));
  await screen.findByText("사용 가능한 아이디입니다.");
  fireEvent.change(screen.getByLabelText("이름"), { target: { value: "홍길동" } });
  fireEvent.change(screen.getByLabelText("생년월일"), { target: { value: "19900101" } });
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "Password1!" } });
  fireEvent.change(screen.getByLabelText("비밀번호 확인"), { target: { value: "Password1!" } });
}

test("실제 중복 확인 서비스의 결과를 표시하고 중복 이메일의 가입을 막는다", async () => {
  vi.mocked(checkEmailAvailability).mockResolvedValue({ available: false, message: "이미 가입된 이메일입니다." });
  renderPage();
  await fillSignupForm("taken@example.com");
  fireEvent.click(emailButton());

  expect(await screen.findByRole("alert")).toHaveTextContent("이미 가입된 이메일입니다.");
  expect(checkEmailAvailability).toHaveBeenCalledWith("taken@example.com");
  expect(screen.queryByText("사용 가능한 이메일입니다.")).not.toBeInTheDocument();
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));
  expect(signUp).not.toHaveBeenCalled();
});

test("확인 후 회원가입에서 발생한 이메일 충돌도 한글로 표시한다", async () => {
  vi.mocked(checkEmailAvailability).mockResolvedValue({ available: true, message: "사용 가능한 이메일입니다." });
  vi.mocked(signUp).mockRejectedValue(new Error("이미 가입된 이메일입니다."));
  renderPage();
  await fillSignupForm("new@example.com");
  fireEvent.click(emailButton());
  await screen.findByText("사용 가능한 이메일입니다.");
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));

  expect(await screen.findByText("이미 가입된 이메일입니다.")).toBeInTheDocument();
  expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "new@example.com" }));
});

test("중복 확인 실패 시 사용 가능 표시나 회원가입을 허용하지 않는다", async () => {
  vi.mocked(checkEmailAvailability).mockRejectedValue(new Error("Network error"));
  renderPage();
  await fillSignupForm("new@example.com");
  fireEvent.click(emailButton());

  expect(await screen.findByRole("alert")).toHaveTextContent("중복 확인 중 오류가 발생했습니다. 다시 시도해 주세요.");
  expect(screen.queryByText("사용 가능한 이메일입니다.")).not.toBeInTheDocument();
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));
  expect(signUp).not.toHaveBeenCalled();
});

test("확인 완료 후 이메일을 변경하면 다시 확인해야 한다", async () => {
  vi.mocked(checkEmailAvailability).mockResolvedValue({ available: true, message: "사용 가능한 이메일입니다." });
  renderPage();
  await fillSignupForm("new@example.com");
  fireEvent.click(emailButton());
  await screen.findByText("사용 가능한 이메일입니다.");
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "taken@example.com" } });
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));

  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("회원가입 전에 이메일 중복 확인을 완료해 주세요."));
  expect(signUp).not.toHaveBeenCalled();
});
