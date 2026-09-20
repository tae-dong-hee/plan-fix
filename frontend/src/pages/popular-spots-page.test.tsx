import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MockedFunction } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router-dom";

import PopularSpotsPage from "@/pages/popular-spots-page";
import { searchSpots, likeSpot, unlikeSpot, UnauthorizedError } from "@/services/spots";

const mockedNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock("@/services/spots");

const mockedSearchSpots = searchSpots as MockedFunction<typeof searchSpots>;
const mockedLikeSpot = likeSpot as MockedFunction<typeof likeSpot>;
const mockedUnlikeSpot = unlikeSpot as MockedFunction<typeof unlikeSpot>;

function renderPopularSpotsPage(initialUrl = "/spots/popular") {
  return render(
    <MemoryRouter
      initialEntries={[initialUrl]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/spots/popular" element={<PopularSpotsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderDiscoverSpotsPage(initialUrl = "/spots") {
  return render(
    <MemoryRouter
      initialEntries={[initialUrl]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/spots" element={<PopularSpotsPage mode="discover" />} />
      </Routes>
    </MemoryRouter>,
  );
}

function RouterState() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return <div data-testid="router-state">{navigationType}:{location.search}</div>;
}

function renderStalePage(mode: "popular" | "discover") {
  const path = mode === "popular" ? "/spots/popular" : "/spots";
  return render(
    <MemoryRouter
      initialEntries={[`${path}?region=강릉&category=카페%2F음료&page=9`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <RouterState />
      <PopularSpotsPage mode={mode} />
    </MemoryRouter>,
  );
}

describe("PopularSpotsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchSpots.mockReset();
  });

  test("fetches only Gangwon popular spots with size 20 when no city is specified", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 1,
          title: "경포해변",
          category: "관광지",
          region: "51",
          sigungu: "150",
          thumbnail: "https://example.com/thumb1.jpg",
        },
        {
          spotId: 2,
          title: "안목해변",
          category: "관광지",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 2,
    });

    renderPopularSpotsPage();

    expect(mockedSearchSpots).toHaveBeenCalledWith({
      category: undefined,
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 0,
    });

    expect(await screen.findByRole("heading", { name: "경포해변" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "안목해변" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "강원도 인기 장소" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "경포해변" })).toHaveAttribute("src", "https://example.com/thumb1.jpg");
    expect(screen.getByRole("img", { name: /안목해변 유사 이미지/ })).toHaveAttribute("src", expect.stringContaining("/images/spot-fallbacks/"));
    expect(screen.getAllByText("유사 이미지")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "사진 출처" })).toHaveAttribute("href", "/image-credits#similar-images");
  });

  test("reads region query parameter and fetches popular spots for that region", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 10,
          title: "속초해수욕장",
          category: "관광지",
          region: "51",
          sigungu: "210",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });

    renderPopularSpotsPage("/spots/popular?region=속초");

    expect(mockedSearchSpots).toHaveBeenCalledWith({
      category: undefined,
      region: "51",
      sigungu: "210",
      sort: "popular",
      size: 20,
      offset: 0,
    });

    expect(await screen.findByRole("heading", { name: "속초해수욕장" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "속초 인기 장소" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "여행 지역 선택: 속초" })).toBeInTheDocument();
  });

  test("shows empty message when fetch returns empty list", async () => {
    mockedSearchSpots.mockResolvedValue({ items: [], offset: 0, size: 20, totalCount: 0 });

    renderPopularSpotsPage();

    expect(await screen.findByText("표시할 인기 장소가 없어요.")).toBeInTheDocument();
  });

  test.each([
    ["popular", "인기 장소", "속초 인기 장소", "표시할 인기 장소가 없어요."],
    ["discover", "여행 장소", "속초에서 뭐 하지?", "추천할 여행 장소가 없어요."],
  ] as const)("%s 조회 실패 후 지역·카테고리·페이지를 유지하며 다시 시도한다", async (mode, label, heading, emptyMessage) => {
    let resolveRetry!: (response: Awaited<ReturnType<typeof searchSpots>>) => void;
    const retry = new Promise<Awaited<ReturnType<typeof searchSpots>>>((resolve) => { resolveRetry = resolve; });
    mockedSearchSpots.mockRejectedValueOnce(new Error("Network failed")).mockReturnValueOnce(retry);

    if (mode === "popular") {
      renderPopularSpotsPage("/spots/popular?region=속초&category=관광지&page=2");
    } else {
      renderDiscoverSpotsPage("/spots?region=속초&category=관광지&page=2");
    }

    expect(await screen.findByRole("alert")).toHaveTextContent(`${label}를 불러오지 못했습니다.`);
    expect(screen.queryByText(emptyMessage)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `${label} 다시 시도` }));

    expect(screen.getByRole("status")).toHaveTextContent(`${label}를 불러오는 중...`);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mockedSearchSpots).toHaveBeenCalledTimes(2);
    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: "관광지",
      region: "51",
      sigungu: "210",
      sort: mode === "popular" ? "popular" : "latest",
      size: 20,
      offset: 20,
    });

    await act(async () => resolveRetry({
      items: [{ spotId: 10, title: "속초해수욕장", category: "관광지", region: "51", sigungu: "210", thumbnail: null }],
      offset: 20,
      size: 20,
      totalCount: 21,
    }));
    expect(screen.getByRole("heading", { name: "속초해수욕장" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "관광지" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("clicking back button navigates to /main", async () => {
    mockedSearchSpots.mockResolvedValue({ items: [], offset: 0, size: 20, totalCount: 0 });

    renderPopularSpotsPage();

    const backButton = screen.getByRole("button", { name: "뒤로 가기" });
    fireEvent.click(backButton);

    expect(mockedNavigate).toHaveBeenCalledWith("/main");
  });

  test("toggles like on a spot card", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 10,
          title: "속초해수욕장",
          category: "관광지",
          region: "51",
          sigungu: "210",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });
    mockedLikeSpot.mockResolvedValue({ liked: true, likeCount: 5 });
    mockedUnlikeSpot.mockResolvedValue({ liked: false, likeCount: 4 });

    renderPopularSpotsPage();
    await screen.findByRole("heading", { name: "속초해수욕장" });

    const likeButton = screen.getByRole("button", { name: "속초해수욕장 좋아요" });
    expect(likeButton).toHaveAttribute("aria-pressed", "false");

    // Click to like
    fireEvent.click(likeButton);
    expect(mockedLikeSpot).toHaveBeenCalledWith(10);

    const likedButton = await screen.findByRole("button", { name: "속초해수욕장 좋아요 취소" });
    expect(likedButton).toHaveAttribute("aria-pressed", "true");

    // Click to unlike
    fireEvent.click(likedButton);
    expect(mockedUnlikeSpot).toHaveBeenCalledWith(10);

    const unlikedButton = await screen.findByRole("button", { name: "속초해수욕장 좋아요" });
    expect(unlikedButton).toHaveAttribute("aria-pressed", "false");
  });

  test("ignores UnauthorizedError silently when like is pressed without authentication", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 20,
          title: "오죽헌",
          category: "문화시설",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });
    mockedLikeSpot.mockRejectedValue(new UnauthorizedError());

    renderPopularSpotsPage();
    await screen.findByRole("heading", { name: "오죽헌" });

    const likeButton = screen.getByRole("button", { name: "오죽헌 좋아요" });
    fireEvent.click(likeButton);

    await waitFor(() => {
      expect(mockedLikeSpot).toHaveBeenCalledWith(20);
    });

    expect(screen.getByRole("button", { name: "오죽헌 좋아요" })).toHaveAttribute("aria-pressed", "false");
  });

  test("can change region and clear region filter", async () => {
    mockedSearchSpots.mockResolvedValue({ items: [], offset: 0, size: 20, totalCount: 0 });

    renderPopularSpotsPage("/spots/popular?region=강릉");
    await screen.findByRole("heading", { name: "강릉 인기 장소" });

    // Click clear region filter button
    const clearButton = screen.getByRole("button", { name: "지역 필터 해제 (전체 보기)" });
    fireEvent.click(clearButton);

    expect(await screen.findByRole("heading", { name: "강원도 인기 장소" })).toBeInTheDocument();
    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: undefined,
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 0,
    });
  });

  test("reads page query parameter and fetches spots with corresponding offset", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 21,
          title: "정동진 모래시계공원",
          category: "관광지",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 20,
      size: 20,
      totalCount: 45,
    });

    renderPopularSpotsPage("/spots/popular?page=2");

    expect(mockedSearchSpots).toHaveBeenCalledWith({
      category: undefined,
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 20,
    });

    expect(await screen.findByRole("heading", { name: "정동진 모래시계공원" })).toBeInTheDocument();
    const page2Button = screen.getByRole("button", { name: "2" });
    expect(page2Button).toHaveAttribute("aria-current", "page");
  });

  test.each([
    ["popular", 45, 3],
    ["discover", 3, 1],
  ] as const)("%s replaces an out-of-range page with the final page while preserving cafe and region filters", async (mode, totalCount, lastPage) => {
    let resolveFinalPage!: (response: Awaited<ReturnType<typeof searchSpots>>) => void;
    const finalPage = new Promise<Awaited<ReturnType<typeof searchSpots>>>((resolve) => {
      resolveFinalPage = resolve;
    });
    mockedSearchSpots
      .mockResolvedValueOnce({ items: [], offset: 160, size: 20, totalCount })
      .mockReturnValueOnce(finalPage);

    renderStalePage(mode);

    await waitFor(() => expect(mockedSearchSpots).toHaveBeenCalledTimes(2));
    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: "카페/음료",
      region: "51",
      sigungu: "150",
      sort: mode === "popular" ? "popular" : "latest",
      size: 20,
      offset: (lastPage - 1) * 20,
    });
    const routerState = screen.getByTestId("router-state").textContent!;
    expect(routerState).toMatch(/^REPLACE:/);
    const params = new URLSearchParams(routerState.substring("REPLACE:".length));
    expect(params.get("region")).toBe("강릉");
    expect(params.get("category")).toBe("카페/음료");
    expect(params.get("page")).toBe(lastPage === 1 ? null : String(lastPage));
    expect(screen.queryByText("표시할 인기 장소가 없어요.")).not.toBeInTheDocument();
    expect(screen.queryByText("추천할 여행 장소가 없어요.")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await act(async () => resolveFinalPage({
      items: [{ spotId: 30, title: "강릉 커피", category: "카페/음료", region: "51", sigungu: "150", thumbnail: null }],
      offset: (lastPage - 1) * 20,
      size: 20,
      totalCount,
    }));

    expect(screen.getByRole("heading", { name: "강릉 커피" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "카페/음료" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(mockedSearchSpots).toHaveBeenCalledTimes(2);
    if (lastPage > 1) {
      expect(screen.getByRole("button", { name: String(lastPage) })).toHaveAttribute("aria-current", "page");
    }
  });

  test("an out-of-range page with no matching spots recovers once and shows the empty state", async () => {
    mockedSearchSpots.mockResolvedValue({ items: [], offset: 0, size: 20, totalCount: 0 });

    renderStalePage("popular");

    expect(await screen.findByText("표시할 인기 장소가 없어요.")).toBeInTheDocument();
    expect(mockedSearchSpots).toHaveBeenCalledTimes(2);
    expect(mockedSearchSpots).toHaveBeenLastCalledWith(expect.objectContaining({
      category: "카페/음료",
      region: "51",
      sigungu: "150",
      offset: 0,
    }));
    expect(screen.getByTestId("router-state").textContent).toMatch(/^REPLACE:/);
    expect(screen.getByTestId("router-state").textContent).not.toContain("page=");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("renders pagination buttons and handles page navigation with scrolling", async () => {
    window.scrollTo = vi.fn();

    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 1,
          title: "경포해변",
          category: "관광지",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 60,
    });

    renderPopularSpotsPage();

    await screen.findByRole("heading", { name: "경포해변" });

    // Total pages: 3 (totalCount: 60, size: 20)
    expect(screen.getByRole("navigation", { name: "페이지네이션" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "2" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "3" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "이전 페이지" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음 페이지" })).not.toBeDisabled();

    // Click page 2
    fireEvent.click(screen.getByRole("button", { name: "2" }));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: undefined,
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 20,
    });

    // Click next page button (to page 3)
    const nextButton = await screen.findByRole("button", { name: "다음 페이지" });
    fireEvent.click(nextButton);
    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: undefined,
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 40,
    });
  });

  test("changing region resets page to 1", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 21,
          title: "정동진",
          category: "관광지",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 20,
      size: 20,
      totalCount: 40,
    });

    renderPopularSpotsPage("/spots/popular?page=2&region=강릉");
    await screen.findByRole("heading", { name: "정동진" });

    expect(mockedSearchSpots).toHaveBeenCalledWith({
      category: undefined,
      region: "51",
      sigungu: "150",
      sort: "popular",
      size: 20,
      offset: 20,
    });

    // Clear region filter
    const clearButton = screen.getByRole("button", { name: "지역 필터 해제 (전체 보기)" });
    fireEvent.click(clearButton);

    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: undefined,
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 0,
    });
  });

  test("reads category query parameter and fetches popular spots for that category", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 30,
          title: "동해막국수",
          category: "음식점",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });

    renderPopularSpotsPage("/spots/popular?category=음식점");

    expect(mockedSearchSpots).toHaveBeenCalledWith({
      category: "음식점",
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 0,
    });

    expect(screen.getByRole("button", { name: "음식점" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "false");
  });

  test("ignores an unknown category query parameter", async () => {
    mockedSearchSpots.mockResolvedValue({ items: [], offset: 0, size: 20, totalCount: 0 });

    renderPopularSpotsPage("/spots/popular?category=없는카테고리");

    expect(mockedSearchSpots).toHaveBeenCalledWith({
      category: undefined,
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 0,
    });
  });

  test("clicking a category chip filters by category, and clicking it again clears the filter", async () => {
    mockedSearchSpots.mockResolvedValue({ items: [], offset: 0, size: 20, totalCount: 0 });

    renderPopularSpotsPage();
    await screen.findByText("표시할 인기 장소가 없어요.");

    fireEvent.click(screen.getByRole("button", { name: "관광지" }));

    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: "관광지",
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 0,
    });
    expect(screen.getByRole("button", { name: "관광지" })).toHaveAttribute("aria-pressed", "true");

    // Click the same chip again to clear the filter
    fireEvent.click(screen.getByRole("button", { name: "관광지" }));

    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: undefined,
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 0,
    });
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
  });

  test("selecting a category resets page to 1", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 21,
          title: "정동진",
          category: "관광지",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 20,
      size: 20,
      totalCount: 40,
    });

    renderPopularSpotsPage("/spots/popular?page=2");
    await screen.findByRole("heading", { name: "정동진" });

    fireEvent.click(screen.getByRole("button", { name: "숙박" }));

    expect(mockedSearchSpots).toHaveBeenLastCalledWith({
      category: "숙박",
      region: "51",
      sigungu: undefined,
      sort: "popular",
      size: 20,
      offset: 0,
    });
  });
});

describe("Discover spots page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    ["/spots", undefined, "강원도"],
    ["/spots?region=강릉", "150", "강릉"],
  ] as const)("%s 여행 장소는 강원도 안에서 최신순으로 조회한다", async (initialUrl, sigungu, locationName) => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 41,
          title: "강릉 중앙시장",
          category: "쇼핑",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });

    renderDiscoverSpotsPage(initialUrl);

    expect(mockedSearchSpots).toHaveBeenCalledWith({
      category: undefined,
      region: "51",
      sigungu,
      sort: "latest",
      size: 20,
      offset: 0,
    });
    expect(await screen.findByRole("heading", { name: `${locationName}에서 뭐 하지?` })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "강릉 중앙시장" })).toBeInTheDocument();
  });
});
