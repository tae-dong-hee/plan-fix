import { act, fireEvent, render, screen, within } from "@testing-library/react";
import SignupForm, { type EmailAvailabilityResult } from "./signup-form";

const emailButton = () => within(screen.getByLabelText("이메일").parentElement!).getByRole("button", { name: "중복 확인" });

function deferredResult() {
  let resolve!: (result: EmailAvailabilityResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<EmailAvailabilityResult>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("이메일을 바꾼 뒤 도착한 이전 확인 결과로 회원가입할 수 없다", async () => {
  const pending = deferredResult();
  const onSubmit = vi.fn();
  render(<SignupForm
    onSubmit={onSubmit}
    onCheckUsernameAvailability={async () => ({ available: true, message: "사용 가능한 아이디입니다." })}
    onCheckEmailAvailability={() => pending.promise}
  />);
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "traveler01" } });
  fireEvent.click(within(screen.getByLabelText("아이디").parentElement!).getByRole("button", { name: "중복 확인" }));
  await screen.findByText("사용 가능한 아이디입니다.");
  fireEvent.change(screen.getByLabelText("이름"), { target: { value: "홍길동" } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "Password1!" } });
  fireEvent.change(screen.getByLabelText("비밀번호 확인"), { target: { value: "Password1!" } });
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "first@example.com" } });
  fireEvent.click(emailButton());
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "taken@example.com" } });

  await act(async () => pending.resolve({ available: true, message: "사용 가능한 이메일입니다." }));

  expect(screen.queryByText("사용 가능한 이메일입니다.")).not.toBeInTheDocument();
  fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));
  expect(screen.getByRole("alert")).toHaveTextContent("회원가입 전에 이메일 중복 확인을 완료해 주세요.");
  expect(onSubmit).not.toHaveBeenCalled();
});

test.each(["success", "failure"])("이전 요청의 늦은 %s 응답이 최신 중복 결과를 덮어쓰지 않는다", async (outcome) => {
  const first = deferredResult();
  const onCheckEmailAvailability = vi.fn()
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ available: false, message: "이미 가입된 이메일입니다." });
  render(<SignupForm onCheckEmailAvailability={onCheckEmailAvailability} />);
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "first@example.com" } });
  fireEvent.click(emailButton());
  fireEvent.change(screen.getByLabelText("이메일"), { target: { value: "taken@example.com" } });
  fireEvent.click(emailButton());
  expect(await screen.findByRole("alert")).toHaveTextContent("이미 가입된 이메일입니다.");

  await act(async () => {
    if (outcome === "success") first.resolve({ available: true, message: "사용 가능한 이메일입니다." });
    else first.reject(new Error("Network error"));
  });

  expect(screen.getByRole("alert")).toHaveTextContent("이미 가입된 이메일입니다.");
  expect(screen.queryByText("사용 가능한 이메일입니다.")).not.toBeInTheDocument();
});
