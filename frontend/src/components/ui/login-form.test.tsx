import { fireEvent, render, screen, within } from "@testing-library/react";

import LoginForm from "./login-form";

test("카카오 계정·비밀번호 찾기는 유효한 복귀 주소를 포함한 공식 복구 페이지를 새 창으로 연다", () => {
  render(<LoginForm />);

  const help = within(screen.getByRole("navigation", { name: "카카오 계정 도움말" }));
  for (const [name, path, continueTo] of [
    ["카카오 계정 찾기 (새 창)", "/weblogin/find_account", "https://accounts.kakao.com/weblogin/account"],
    ["카카오 비밀번호 찾기 (새 창)", "/weblogin/find_password", "/login?continue=https%3A%2F%2Faccounts.kakao.com%2Fweblogin%2Faccount&talk_login="],
  ]) {
    const link = help.getByRole("link", { name });
    const url = new URL(link.getAttribute("href")!);
    expect(url.origin).toBe("https://accounts.kakao.com");
    expect(url.pathname).toBe(path);
    expect(url.searchParams.get("continue")).toBe(continueTo);
    expect(url.searchParams.get("lang")).toBe("ko");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  expect(screen.getByRole("link", { name: "비밀번호를 잊으셨나요?" })).toHaveAttribute("href", "/forgot-password");
});

test("복구 링크는 입력값을 외부로 보내거나 폼을 제출하지 않고 기존 입력을 유지한다", () => {
  const onSubmit = vi.fn();
  const onKakaoLogin = vi.fn();
  render(<LoginForm onSubmit={onSubmit} onKakaoLogin={onKakaoLogin} />);

  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "privateuser1" } });
  fireEvent.submit(screen.getByRole("button", { name: "로그인" }).closest("form")!);
  expect(screen.getByRole("alert")).toHaveTextContent("비밀번호를 입력해 주세요.");
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "Private-password1!" } });

  for (const link of within(screen.getByRole("navigation", { name: "카카오 계정 도움말" })).getAllByRole("link")) {
    expect(link.getAttribute("href")).not.toMatch(/privateuser1|Private-password1/);
    fireEvent.click(link);
  }

  expect(onSubmit).not.toHaveBeenCalled();
  expect(onKakaoLogin).not.toHaveBeenCalled();
  expect(screen.getByLabelText("아이디")).toHaveValue("privateuser1");
  expect(screen.getByLabelText("비밀번호")).toHaveValue("Private-password1!");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("로그인 처리 중에는 로그인 버튼만 잠기고 복구 링크는 사용할 수 있다", () => {
  const onKakaoLogin = vi.fn();
  render(<LoginForm isSubmitting onKakaoLogin={onKakaoLogin} />);

  const kakaoLogin = screen.getByRole("button", { name: "카카오 로그인" });
  expect(kakaoLogin).toBeDisabled();
  expect(screen.getByRole("button", { name: /로그인 중/ })).toBeDisabled();
  fireEvent.click(kakaoLogin);
  expect(onKakaoLogin).not.toHaveBeenCalled();
  expect(within(screen.getByRole("navigation", { name: "카카오 계정 도움말" })).getAllByRole("link")).toHaveLength(2);
  expect(screen.queryByText(/회원가입|아직 계정이 없으신가요/)).not.toBeInTheDocument();
});
