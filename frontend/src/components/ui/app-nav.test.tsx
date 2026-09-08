import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MockedFunction } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import AppNav from "@/components/ui/app-nav";
import { signOut } from "@/services/auth";

const mockedNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock("@/services/auth");

const mockedSignOut = signOut as MockedFunction<typeof signOut>;

function renderAppNav(initialUrl = "/main") {
  return render(
    <MemoryRouter
      initialEntries={[initialUrl]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="*" element={<AppNav />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppNav component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders the brand logo and all navigation items", () => {
    renderAppNav();

    expect(screen.getByRole("link", { name: "PlanFix 홈" })).toHaveAttribute("href", "/main");
    expect(screen.queryByRole("button", { name: "검색" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내 코스" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "여행" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "위시리스트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "프로필" })).toBeInTheDocument();
  });

  test("clicking '내 코스' navigates to /courses", () => {
    renderAppNav();

    fireEvent.click(screen.getByRole("button", { name: "내 코스" }));
    expect(mockedNavigate).toHaveBeenCalledWith("/courses");
  });

  test("sets '내 코스' as active on /courses route", () => {
    renderAppNav("/courses");
    expect(screen.getByRole("button", { name: "내 코스" })).toHaveAttribute("aria-current", "page");
  });

  test("sets '여행' as active on /main, /spots/*, and /boards/* routes", () => {
    const { unmount } = renderAppNav("/main");
    expect(screen.getByRole("button", { name: "여행" })).toHaveAttribute("aria-current", "page");
    unmount();

    const { unmount: unmountSpots } = renderAppNav("/spots/popular");
    expect(screen.getByRole("button", { name: "여행" })).toHaveAttribute("aria-current", "page");
    unmountSpots();

    renderAppNav("/boards/1");
    expect(screen.getByRole("button", { name: "여행" })).toHaveAttribute("aria-current", "page");
  });

  test("clicking '여행' toggles the course selection modal", () => {
    renderAppNav();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const tripButton = screen.getByRole("button", { name: "여행" });
    fireEvent.click(tripButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("여행 코스 만들기")).toBeInTheDocument();
    expect(screen.getByText("AI 코스 생성")).toBeInTheDocument();
    expect(screen.getByText("직접 코스 생성")).toBeInTheDocument();

    // Toggle close
    fireEvent.click(tripButton);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("selecting AI 코스 생성 in modal closes modal and navigates to /courses/create?mode=ai", () => {
    renderAppNav();

    fireEvent.click(screen.getByRole("button", { name: "여행" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const aiButton = screen.getByRole("button", { name: /AI 코스 생성/i });
    expect(aiButton).not.toBeDisabled();
    expect(screen.getByText("AI 추천")).toBeInTheDocument();

    fireEvent.click(aiButton);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedNavigate).toHaveBeenCalledWith("/courses/create?mode=ai");
  });

  test("selecting 직접 코스 생성 in modal closes modal and navigates to /courses/create", () => {
    renderAppNav();

    fireEvent.click(screen.getByRole("button", { name: "여행" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /직접 코스 생성/i }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedNavigate).toHaveBeenCalledWith("/courses/create");
  });

  test("clicking profile nav button toggles the profile menu with logout option", () => {
    renderAppNav();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    expect(screen.queryByRole("menu", { name: "프로필 메뉴" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "로그아웃" })).not.toBeInTheDocument();

    // Open profile menu
    fireEvent.click(profileButton);
    expect(screen.getByRole("menu", { name: "프로필 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "로그아웃" })).toBeInTheDocument();

    // Close profile menu by clicking profile button again
    fireEvent.click(profileButton);
    expect(screen.queryByRole("menu", { name: "프로필 메뉴" })).not.toBeInTheDocument();
  });

  test("clicking outside/backdrop closes the profile menu", () => {
    renderAppNav();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    fireEvent.click(profileButton);
    expect(screen.getByRole("menu", { name: "프로필 메뉴" })).toBeInTheDocument();

    const backdrop = screen.getByTestId("profile-menu-backdrop");
    fireEvent.click(backdrop);
    expect(screen.queryByRole("menu", { name: "프로필 메뉴" })).not.toBeInTheDocument();
  });

  test("pressing Escape key closes the profile menu", () => {
    renderAppNav();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    fireEvent.click(profileButton);
    expect(screen.getByRole("menu", { name: "프로필 메뉴" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "프로필 메뉴" })).not.toBeInTheDocument();
  });

  test("clicking logout button calls signOut and navigates to /login with replace", async () => {
    mockedSignOut.mockResolvedValue(undefined);
    renderAppNav();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    fireEvent.click(profileButton);

    const logoutButton = screen.getByRole("menuitem", { name: "로그아웃" });
    fireEvent.click(logoutButton);

    expect(mockedSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  test("navigates to /login with replace even if signOut throws an error", async () => {
    mockedSignOut.mockRejectedValue(new Error("Network failed"));
    renderAppNav();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    fireEvent.click(profileButton);

    const logoutButton = screen.getByRole("menuitem", { name: "로그아웃" });
    fireEvent.click(logoutButton);

    expect(mockedSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  test("disables logout button while signOut is processing", async () => {
    let resolveSignOut!: () => void;
    mockedSignOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        }),
    );

    renderAppNav();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    fireEvent.click(profileButton);

    const logoutButton = screen.getByRole("menuitem", { name: "로그아웃" });
    fireEvent.click(logoutButton);

    expect(logoutButton).toBeDisabled();
    expect(screen.getByText("로그아웃 중...")).toBeInTheDocument();

    resolveSignOut();

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });
});
