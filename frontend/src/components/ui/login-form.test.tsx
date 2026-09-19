import { fireEvent, render, screen } from "@testing-library/react";

import LoginForm from "./login-form";

test("회원가입 진입점을 표시하고 중간 카카오 안내 UI는 렌더링하지 않는다", () => {
  render(<LoginForm />);

  expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
  expect(screen.getByRole("link", { name: "비밀번호를 잊으셨나요?" })).toHaveAttribute("href", "/forgot-password");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "카카오 계정 도움말" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /카카오 계정 찾기/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /카카오 비밀번호 찾기/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "카카오로 계속하기" })).not.toBeInTheDocument();
});

test("회원가입 링크는 전달받은 경로와 이동 콜백을 사용한다", () => {
  const onSignUp = vi.fn();
  const onSubmit = vi.fn();
  render(<LoginForm signUpHref="/signup?returnTo=%2Fcourse-invites%2Ftoken" onSignUp={onSignUp} onSubmit={onSubmit} />);

  const signup = screen.getByRole("link", { name: "회원가입" });
  expect(signup).toHaveAttribute("href", "/signup?returnTo=%2Fcourse-invites%2Ftoken");
  fireEvent.click(signup);
  expect(onSignUp).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
});

test("카카오 로그인 클릭 한 번으로 바로 로그인을 시작한다", () => {
  const onKakaoLogin = vi.fn();
  const onSubmit = vi.fn();
  render(<LoginForm onKakaoLogin={onKakaoLogin} onSubmit={onSubmit} />);

  fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));

  expect(onKakaoLogin).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "카카오 계정 도움말" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "카카오로 계속하기" })).not.toBeInTheDocument();
});

test("로그인 처리 중에는 카카오 로그인을 시작하지 않는다", () => {
  const onKakaoLogin = vi.fn();
  render(<LoginForm isSubmitting onKakaoLogin={onKakaoLogin} />);

  const kakaoLogin = screen.getByRole("button", { name: "카카오 로그인" });
  expect(kakaoLogin).toBeDisabled();
  expect(screen.getByRole("button", { name: /로그인 중/ })).toBeDisabled();
  fireEvent.click(kakaoLogin);
  expect(onKakaoLogin).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "카카오 계정 도움말" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
});
