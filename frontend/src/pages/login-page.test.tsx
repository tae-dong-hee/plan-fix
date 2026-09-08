import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./login-page";
import { isAuthApiConfigured, signIn, startKakaoSignIn } from "@/services/auth";

const navigate = vi.fn();
vi.mock("react-router-dom", async () => ({ ...await vi.importActual("react-router-dom"), useNavigate: () => navigate }));
vi.mock("@/services/auth", () => ({ isAuthApiConfigured: vi.fn(), signIn: vi.fn(), startKakaoSignIn: vi.fn() }));
vi.mock("@/components/ui/travel-globe-transition", () => ({ default: () => <p>로그인 완료 이동 중</p> }));

function renderLogin({ returnTo, search = "" }: { returnTo?: string; search?: string } = {}) {
  return render(<MemoryRouter initialEntries={[{ pathname: "/login", search, state: returnTo ? { returnTo } : null }]}><LoginPage /></MemoryRouter>);
}

async function submitLogin() {
  fireEvent.change(screen.getByLabelText("아이디"), { target: { value: "travel123" } });
  fireEvent.change(screen.getByLabelText("비밀번호"), { target: { value: "Password123!" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "로그인" })); });
}

async function finishTransition(duration = 1600) {
  await act(async () => { await vi.advanceTimersByTimeAsync(duration); });
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.mocked(isAuthApiConfigured).mockReturnValue(true);
    vi.mocked(signIn).mockResolvedValue({ user: { id: 1, username: "여행자", email: null } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  test("password login opens the main page after the existing transition", async () => {
    renderLogin();
    await submitLogin();
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText("로그인 완료 이동 중")).toBeInTheDocument();
    await finishTransition();
    expect(signIn).toHaveBeenCalledWith({ loginId: "travel123", password: "Password123!" });
    expect(navigate).toHaveBeenCalledWith("/main", { replace: true });
  });

  test("old invitation navigation state no longer changes the login destination or shows a banner", async () => {
    renderLogin({ returnTo: "/invite#token=previous-invitation" });
    expect(screen.queryByText("로그인 후 초대받은 여행으로 돌아갑니다.")).not.toBeInTheDocument();
    await submitLogin();
    await finishTransition();
    expect(navigate).toHaveBeenCalledWith("/main", { replace: true });
  });

  test("demo login opens the main page without calling the authentication API", async () => {
    vi.mocked(isAuthApiConfigured).mockReturnValue(false);
    renderLogin();
    await submitLogin();
    await finishTransition(2500);
    expect(signIn).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/main", { replace: true });
  });

  test("failed login shows the error and keeps the entered values for retry", async () => {
    vi.mocked(signIn).mockRejectedValue(new Error("아이디와 비밀번호를 확인해주세요."));
    renderLogin();
    await submitLogin();
    expect(screen.getByText("아이디와 비밀번호를 확인해주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("아이디")).toHaveValue("travel123");
    expect(screen.getByLabelText("비밀번호")).toHaveValue("Password123!");
    expect(screen.getByRole("button", { name: "로그인" })).not.toBeDisabled();
    expect(navigate).not.toHaveBeenCalled();
  });

  test("Kakao login starts the existing authentication flow", () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));
    expect(startKakaoSignIn).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  test("Kakao login without a configured backend shows the existing setup notice", () => {
    vi.mocked(isAuthApiConfigured).mockReturnValue(false);
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "카카오 로그인" }));
    expect(screen.getByText("카카오 로그인은 백엔드 연결이 필요합니다. VITE_API_BASE_URL을 설정해 주세요.")).toBeInTheDocument();
    expect(startKakaoSignIn).not.toHaveBeenCalled();
  });

  test("Kakao callback errors retain their existing user-facing message", () => {
    renderLogin({ search: "?error=denied" });
    expect(screen.getByText("카카오 로그인을 취소했습니다.")).toBeInTheDocument();
  });
});
