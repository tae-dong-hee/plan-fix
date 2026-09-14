import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import AuthReturnRedirect from "@/components/auth-return-redirect";
import { readPendingAuthReturnTo, savePendingAuthReturnTo } from "@/lib/auth-return-to";
import { signIn, startKakaoSignIn } from "@/services/auth";
import { signUp } from "@/services/user";
import LoginPage from "./login-page";
import SignupPage from "./signup-page";

vi.mock("@/services/auth", () => ({
  isAuthApiConfigured: () => true,
  signIn: vi.fn(async () => ({ user: { id: 1, username: "여행자", email: null } })),
  startKakaoSignIn: vi.fn(),
}));

vi.mock("@/services/user", () => ({
  isUserApiConfigured: () => true,
  signUp: vi.fn(async () => ({})),
  checkUsernameAvailability: vi.fn(async () => ({ available: true, message: "사용 가능한 아이디입니다." })),
}));

vi.mock("@/components/ui/travel-globe-transition", () => ({
  default: () => <div>로그인 완료</div>,
}));

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}{location.search}</output>;
}

function renderFlow(path: string) {
  return render(<StrictMode><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <CurrentPath />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/main" element={<AuthReturnRedirect><div>메인 화면</div></AuthReturnRedirect>} />
      <Route path="/course-invites/:token" element={<div>초대 정보</div>} />
    </Routes>
  </MemoryRouter></StrictMode>);
}

async function submitLogin() {
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "testuser1" } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "Password1" } });
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "로그인" }).closest("form")!);
    await vi.advanceTimersByTimeAsync(1600);
  });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});

test("자체 로그인 후 초대 화면으로 복귀한다", async () => {
  renderFlow("/login?returnTo=%2Fcourse-invites%2Ftest-token");
  await submitLogin();
  expect(signIn).toHaveBeenCalledWith({ loginId: "testuser1", password: "Password1" });
  expect(screen.getByTestId("current-path")).toHaveTextContent("/course-invites/test-token");
  expect(screen.getByText("초대 정보")).toBeInTheDocument();
});

test.each(["/login", "/login?returnTo=https%3A%2F%2Fevil.example", "/login?returnTo=%2Fcourses%2F123"])("일반 로그인 또는 잘못된 복귀 주소는 메인으로 이동한다: %s", async (path) => {
  renderFlow(path);
  await submitLogin();
  expect(screen.getByText("메인 화면")).toBeInTheDocument();
  expect(screen.getByTestId("current-path")).toHaveTextContent("/main");
});

test("로그인에서 가입으로 이동하고 돌아올 때 초대 경로를 유지한다", () => {
  renderFlow("/login?returnTo=%2Fcourse-invites%2Ftest-token");
  expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup?returnTo=%2Fcourse-invites%2Ftest-token");
  fireEvent.click(screen.getByRole("link", { name: "회원가입" }));
  expect(screen.getByTestId("current-path")).toHaveTextContent("/signup?returnTo=%2Fcourse-invites%2Ftest-token");
  expect(screen.getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?returnTo=%2Fcourse-invites%2Ftest-token");
  fireEvent.click(screen.getByRole("link", { name: "로그인" }));
  expect(screen.getByTestId("current-path")).toHaveTextContent("/login?returnTo=%2Fcourse-invites%2Ftest-token");
});

test("회원가입 성공 후 로그인 화면에도 초대 복귀 주소가 남는다", async () => {
  renderFlow("/signup?returnTo=%2Fcourse-invites%2Ftest-token");
  for (const [label, value] of [["아이디", "testuser1"], ["이름", "여행자"], ["생년월일", "19900101"], ["이메일", "new@example.com"], ["비밀번호", "Password1"], ["비밀번호 확인", "Password1"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  await act(async () => {
    for (const label of ["아이디", "이메일"]) {
      fireEvent.click(within(screen.getByLabelText(label).parentElement!).getByRole("button", { name: "중복 확인" }));
    }
    await vi.advanceTimersByTimeAsync(450);
  });
  await act(async () => {
    fireEvent.submit(screen.getByRole("form", { name: "회원가입 정보" }));
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(signUp).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
  expect(screen.getByTestId("current-path")).toHaveTextContent("/login?returnTo=%2Fcourse-invites%2Ftest-token");
});

test("카카오 로그인 시작 시에만 초대 복귀 주소를 세션에 저장한다", () => {
  renderFlow("/login?returnTo=%2Fcourse-invites%2Ftest-token");
  expect(readPendingAuthReturnTo()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));
  expect(startKakaoSignIn).toHaveBeenCalledTimes(1);
  expect(readPendingAuthReturnTo()).toBe("/course-invites/test-token");
});

test("카카오 성공 콜백의 메인 진입은 초대 화면으로 한 번 복귀하고 세션을 정리한다", () => {
  savePendingAuthReturnTo("/course-invites/test-token");
  const first = renderFlow("/main");
  expect(screen.getByText("초대 정보")).toBeInTheDocument();
  expect(readPendingAuthReturnTo()).toBeNull();
  first.unmount();
  renderFlow("/main");
  expect(screen.getByText("메인 화면")).toBeInTheDocument();
});

test("카카오 실패 화면을 새로고침한 뒤 일반 로그인해도 초대로 복귀한다", async () => {
  savePendingAuthReturnTo("/course-invites/test-token");
  const first = renderFlow("/login?error=denied");
  expect(screen.getByText("카카오 로그인을 취소했습니다.")).toBeInTheDocument();
  expect(readPendingAuthReturnTo()).toBeNull();
  const restoredUrl = screen.getByTestId("current-path").textContent!;
  expect(restoredUrl).toBe("/login?error=denied&returnTo=%2Fcourse-invites%2Ftest-token");
  first.unmount();
  renderFlow(restoredUrl);
  expect(screen.getByRole("link", { name: "회원가입" })).toHaveAttribute("href", "/signup?returnTo=%2Fcourse-invites%2Ftest-token");
  await submitLogin();
  expect(screen.getByText("초대 정보")).toBeInTheDocument();
});

test("만료된 카카오 복귀 정보로는 메인에서 초대로 이동하지 않는다", () => {
  savePendingAuthReturnTo("/course-invites/old-token");
  vi.advanceTimersByTime(15 * 60 * 1000);
  renderFlow("/main");
  expect(screen.getByText("메인 화면")).toBeInTheDocument();
  expect(sessionStorage.length).toBe(0);
});

test("초대 경로 없이 로그인 화면에 진입하면 이전 카카오 시도를 정리한다", async () => {
  savePendingAuthReturnTo("/course-invites/old-token");
  renderFlow("/login");
  expect(readPendingAuthReturnTo()).toBeNull();
  await submitLogin();
  expect(screen.getByText("메인 화면")).toBeInTheDocument();
});
