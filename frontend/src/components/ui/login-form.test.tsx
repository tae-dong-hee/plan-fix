import { fireEvent, render, screen, within } from "@testing-library/react";

import LoginForm from "./login-form";

function openKakaoDialog() {
  fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));
  return screen.getByRole("dialog", { name: "카카오 로그인" });
}

test("처음에는 회원가입 진입점을 표시하고 카카오 복구 메뉴는 표시하지 않는다", () => {
  render(<LoginForm />);

  expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup");
  expect(screen.getByRole("link", { name: "비밀번호를 잊으셨나요?" })).toHaveAttribute("href", "/forgot-password");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "카카오 계정 도움말" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /카카오 계정 찾기/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /카카오 비밀번호 찾기/ })).not.toBeInTheDocument();
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

test("카카오 로그인 클릭 뒤 안내창에서만 공식 계정·비밀번호 복구 페이지를 새 창으로 연다", () => {
  const onKakaoLogin = vi.fn();
  render(<LoginForm onKakaoLogin={onKakaoLogin} />);

  const dialog = openKakaoDialog();
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(onKakaoLogin).not.toHaveBeenCalled();
  const help = within(within(dialog).getByRole("navigation", { name: "카카오 계정 도움말" }));
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
});

test("카카오로 계속하기를 눌러야 로그인을 한 번 시작하고 안내창을 닫는다", () => {
  const onKakaoLogin = vi.fn();
  const onSubmit = vi.fn();
  render(<LoginForm onKakaoLogin={onKakaoLogin} onSubmit={onSubmit} />);

  const dialog = openKakaoDialog();
  expect(onKakaoLogin).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "카카오로 계속하기" }));

  expect(onKakaoLogin).toHaveBeenCalledTimes(1);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "카카오 계정 도움말" })).not.toBeInTheDocument();
});

test("복구 링크는 입력값을 외부로 보내거나 폼을 제출하지 않고 기존 입력을 유지한다", () => {
  const onSubmit = vi.fn();
  const onKakaoLogin = vi.fn();
  render(<LoginForm onSubmit={onSubmit} onKakaoLogin={onKakaoLogin} />);

  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "privateuser1" } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "Private-password1!" } });
  const dialog = openKakaoDialog();

  for (const link of within(dialog).getAllByRole("link")) {
    expect(link.getAttribute("href")).not.toMatch(/privateuser1|Private-password1/);
    fireEvent.click(link);
  }

  expect(onSubmit).not.toHaveBeenCalled();
  expect(onKakaoLogin).not.toHaveBeenCalled();
  expect(dialog).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "카카오 로그인 닫기" }));
  expect(screen.getByLabelText("아이디")).toHaveValue("privateuser1");
  expect(screen.getByLabelText("비밀번호")).toHaveValue("Private-password1!");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test.each(["닫기 버튼", "Escape"])("%s로 안내창을 닫으면 로그인하지 않고 카카오 버튼으로 포커스를 돌린다", (method) => {
  const onKakaoLogin = vi.fn();
  render(<LoginForm onKakaoLogin={onKakaoLogin} />);
  const trigger = screen.getByRole("button", { name: "카카오 로그인" });
  trigger.focus();
  const dialog = openKakaoDialog();

  expect(dialog.contains(document.activeElement)).toBe(true);
  if (method === "닫기 버튼") {
    fireEvent.click(within(dialog).getByRole("button", { name: "카카오 로그인 닫기" }));
  } else {
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  }

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(onKakaoLogin).not.toHaveBeenCalled();
});

test("안내창 안을 클릭하면 유지하고 배경을 클릭하면 로그인하지 않고 닫는다", () => {
  const onKakaoLogin = vi.fn();
  render(<LoginForm onKakaoLogin={onKakaoLogin} />);
  const trigger = screen.getByRole("button", { name: "카카오 로그인" });
  const dialog = openKakaoDialog();

  fireEvent.mouseDown(within(dialog).getByRole("heading", { name: "카카오 로그인" }));
  expect(dialog).toBeInTheDocument();
  fireEvent.mouseDown(dialog.parentElement!);

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onKakaoLogin).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
});

test("안내창의 Tab과 Shift+Tab 포커스가 대화상자 안에서 순환한다", () => {
  render(<LoginForm />);
  const dialog = openKakaoDialog();
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  last.focus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
});

test("로그인 처리 중에는 카카오 안내창과 중복 로그인을 시작하지 않는다", () => {
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
