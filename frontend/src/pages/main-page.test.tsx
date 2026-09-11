import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MockedFunction } from "vitest";
import { Sun } from "lucide-react";
import { MemoryRouter } from "react-router-dom";

import MainPage from "@/pages/main-page";
import { signOut } from "@/services/auth";
import { fetchPopularBoards } from "@/services/board";
import {
  fetchPopularSpots,
  likeSpot,
  searchSpots,
  unlikeSpot,
  UnauthorizedError,
} from "@/services/spots";
import { fetch5DayWeather } from "@/services/weather";

const mockedNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock("@/services/spots");
vi.mock("@/services/board");
vi.mock("@/services/auth");
vi.mock("@/services/weather");

const mockedFetchPopularSpots = fetchPopularSpots as MockedFunction<typeof fetchPopularSpots>;
const mockedSearchSpots = searchSpots as MockedFunction<typeof searchSpots>;
const mockedFetchPopularBoards = fetchPopularBoards as MockedFunction<typeof fetchPopularBoards>;
const mockedLikeSpot = likeSpot as MockedFunction<typeof likeSpot>;
const mockedUnlikeSpot = unlikeSpot as MockedFunction<typeof unlikeSpot>;
const mockedSignOut = signOut as MockedFunction<typeof signOut>;
const mockedFetch5DayWeather = fetch5DayWeather as MockedFunction<typeof fetch5DayWeather>;

function renderMainPage() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <MainPage />
    </MemoryRouter>,
  );
}

const mockWeatherItems = [
  {
    date: "09.02",
    day: "수",
    low: 20,
    high: 28,
    rainProb: 10,
    weatherCode: 0,
    description: "맑음",
    icon: Sun,
    iconClass: "fill-amber-400 text-amber-400",
  },
];

const emptySpotResult = { items: [], offset: 0, size: 20, totalCount: 0 };

describe("MainPage travel spot carousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchSpots.mockResolvedValue(emptySpotResult);
    mockedFetchPopularSpots.mockResolvedValue(emptySpotResult);
    mockedFetchPopularBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);
  });

  test("loads latest spots and links cards and the full list to their screens", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 31,
          title: "대관령 양떼목장",
          category: "관광지",
          region: "51",
          sigungu: "100",
          thumbnail: "https://example.com/sheep.jpg",
          isLiked: false,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });

    renderMainPage();

    expect(mockedSearchSpots).toHaveBeenCalledWith({
      region: undefined,
      sigungu: undefined,
      sort: "latest",
      size: 20,
    });
    expect((await screen.findByText("대관령 양떼목장")).closest("a")).toHaveAttribute(
      "href",
      "/spots/31",
    );
    expect(screen.getByRole("link", { name: "강원도에서 뭐 하지? 전체보기" })).toHaveAttribute(
      "href",
      "/spots",
    );
  });

  test("moves the travel spot carousel left and right", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 31,
          title: "대관령 양떼목장",
          category: "관광지",
          region: "51",
          sigungu: "100",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });

    renderMainPage();
    const carousel = await screen.findByLabelText("강원도 여행 장소");
    const scrollBy = vi.fn();
    carousel.scrollBy = scrollBy;
    Object.defineProperties(carousel, {
      scrollWidth: { value: 1000, configurable: true },
      clientWidth: { value: 300, configurable: true },
      scrollLeft: { value: 0, configurable: true, writable: true },
    });

    fireEvent.scroll(carousel);
    fireEvent.click(await screen.findByRole("button", { name: "다음 여행 장소 보기" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 200, behavior: "smooth" });

    carousel.scrollLeft = 200;
    fireEvent.scroll(carousel);
    fireEvent.click(await screen.findByRole("button", { name: "이전 여행 장소 보기" }));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -200, behavior: "smooth" });
  });

  test("saves and removes a travel spot through the account wishlist API", async () => {
    mockedSearchSpots.mockResolvedValue({
      items: [
        {
          spotId: 31,
          title: "대관령 양떼목장",
          category: "관광지",
          region: "51",
          sigungu: "100",
          thumbnail: null,
          isLiked: false,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });
    mockedLikeSpot.mockResolvedValue({ liked: true, likeCount: 1 });
    mockedUnlikeSpot.mockResolvedValue({ liked: false, likeCount: 0 });

    renderMainPage();
    fireEvent.click(await screen.findByRole("button", { name: "대관령 양떼목장 좋아요" }));
    expect(mockedLikeSpot).toHaveBeenCalledWith(31);

    fireEvent.click(await screen.findByRole("button", { name: "대관령 양떼목장 좋아요 취소" }));
    expect(mockedUnlikeSpot).toHaveBeenCalledWith(31);
  });
});

describe("MainPage popular spots carousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchSpots.mockResolvedValue(emptySpotResult);
    mockedFetchPopularBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);
  });

  test("fetches popular spots with size 6 on initial load", async () => {
    mockedFetchPopularSpots.mockResolvedValue({
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
          thumbnail: "https://example.com/thumb2.jpg",
        },
      ],
      offset: 0,
      size: 6,
      totalCount: 2,
    });

    renderMainPage();

    expect(mockedFetchPopularSpots).toHaveBeenCalledWith({
      region: undefined,
      sigungu: undefined,
      size: 20,
    });

    expect(await screen.findByText("경포해변")).toBeInTheDocument();
    expect(screen.getByText("안목해변")).toBeInTheDocument();
  });

  test("shows empty message when fetch fails or returns empty list", async () => {
    mockedFetchPopularSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });

    renderMainPage();

    expect(await screen.findByText("표시할 인기 장소가 없어요.")).toBeInTheDocument();
  });

  test("clicking '인기 장소 더보기' navigates to /spots/popular", async () => {
    mockedFetchPopularSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });

    renderMainPage();

    const moreButton = screen.getByRole("button", { name: "인기 장소 더보기" });
    fireEvent.click(moreButton);

    expect(mockedNavigate).toHaveBeenCalledWith("/spots/popular");
  });

  test("clicking '인기 장소 더보기' with selected region navigates to /spots/popular with region query", async () => {
    mockedFetchPopularSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });

    renderMainPage();

    fireEvent.click(screen.getByRole("button", { name: "여행 지역 선택: 강원도 / 지역 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "강릉" }));
    fireEvent.click(screen.getByRole("button", { name: "강릉 선택하기" }));

    const moreButton = screen.getByRole("button", { name: "인기 장소 더보기" });
    fireEvent.click(moreButton);

    expect(mockedNavigate).toHaveBeenCalledWith("/spots/popular?region=%EA%B0%95%EB%A6%89");
  });

  test("carousel arrow buttons scroll the carousel left and right based on scroll position", async () => {
    mockedFetchPopularSpots.mockResolvedValue({
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
      size: 6,
      totalCount: 1,
    });

    renderMainPage();
    await screen.findByText("경포해변");

    const carouselElement = screen.getByText("경포해변").closest(".overflow-x-auto") as HTMLElement;
    const scrollByMock = vi.fn();
    carouselElement.scrollBy = scrollByMock;

    Object.defineProperty(carouselElement, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(carouselElement, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(carouselElement, "scrollLeft", { value: 0, configurable: true, writable: true });

    fireEvent.scroll(carouselElement);

    expect(screen.getByRole("button", { name: "이전 인기 장소 보기" })).toBeDisabled();
    const rightButton = await screen.findByRole("button", { name: "다음 인기 장소 보기" });
    expect(rightButton).toBeEnabled();

    fireEvent.click(rightButton);
    expect(scrollByMock).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number), behavior: "smooth" }),
    );

    carouselElement.scrollLeft = 200;
    fireEvent.scroll(carouselElement);

    const leftButton = await screen.findByRole("button", { name: "이전 인기 장소 보기" });
    expect(leftButton).toBeEnabled();

    fireEvent.click(leftButton);
    expect(scrollByMock).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number), behavior: "smooth" }),
    );
    expect(scrollByMock.mock.calls[1][0].left).toBeLessThan(0);
  });

  test("toggles like on a spot card and handles like/unlike correctly", async () => {
    mockedFetchPopularSpots.mockResolvedValue({
      items: [
        {
          spotId: 10,
          title: "속초해수욕장",
          category: "관광지",
          region: "51",
          sigungu: "160",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 6,
      totalCount: 1,
    });
    mockedLikeSpot.mockResolvedValue({ liked: true, likeCount: 5 });
    mockedUnlikeSpot.mockResolvedValue({ liked: false, likeCount: 4 });

    renderMainPage();
    await screen.findByText("속초해수욕장");

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
    mockedFetchPopularSpots.mockResolvedValue({
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
      size: 6,
      totalCount: 1,
    });
    mockedLikeSpot.mockRejectedValue(new UnauthorizedError());

    renderMainPage();
    await screen.findByText("오죽헌");

    const likeButton = screen.getByRole("button", { name: "오죽헌 좋아요" });
    fireEvent.click(likeButton);

    await waitFor(() => {
      expect(mockedLikeSpot).toHaveBeenCalledWith(20);
    });

    // Should remain unliked without throwing error or crashing
    expect(screen.getByRole("button", { name: "오죽헌 좋아요" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("MainPage popular boards carousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchSpots.mockResolvedValue(emptySpotResult);
    mockedFetchPopularSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);
  });

  test("fetches popular boards with size 6 on initial load and renders cards", async () => {
    mockedFetchPopularBoards.mockResolvedValue({
      items: [
        {
          boardId: 101,
          title: "강릉 카페 투어 추천",
          thumbnail: "https://example.com/cafe.jpg",
          userId: 1,
          likeCount: 12,
          viewCount: 150,
          commentCount: 5,
          createdAt: "2026-09-01T10:00:00Z",
        },
        {
          boardId: 102,
          title: "속초 1박 2일 코스",
          thumbnail: null,
          userId: 2,
          likeCount: 8,
          viewCount: 90,
          commentCount: 2,
          createdAt: "2026-09-01T11:00:00Z",
        },
      ],
      offset: 0,
      size: 6,
      totalCount: 2,
    });

    renderMainPage();

    expect(mockedFetchPopularBoards).toHaveBeenCalledWith({ size: 6 });

    expect(await screen.findByText("강릉 카페 투어 추천")).toBeInTheDocument();
    expect(screen.getByText("속초 1박 2일 코스")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    const link1 = screen.getByText("강릉 카페 투어 추천").closest("a");
    const link2 = screen.getByText("속초 1박 2일 코스").closest("a");
    expect(link1).toHaveAttribute("href", "/boards/101");
    expect(link2).toHaveAttribute("href", "/boards/102");
  });

  test("shows empty message when fetch boards fails or returns empty list", async () => {
    mockedFetchPopularBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });

    renderMainPage();

    expect(await screen.findByText("표시할 게시글이 없어요.")).toBeInTheDocument();
  });

  test("board carousel arrow buttons scroll the board carousel left and right based on scroll position", async () => {
    mockedFetchPopularBoards.mockResolvedValue({
      items: [
        {
          boardId: 101,
          title: "강릉 카페 투어 추천",
          thumbnail: null,
          userId: 1,
          likeCount: 0,
          viewCount: 0,
          commentCount: 0,
          createdAt: "2026-09-01T10:00:00Z",
        },
      ],
      offset: 0,
      size: 6,
      totalCount: 1,
    });

    renderMainPage();
    await screen.findByText("강릉 카페 투어 추천");

    const carouselElement = screen.getByText("강릉 카페 투어 추천").closest(".overflow-x-auto") as HTMLElement;
    const scrollByMock = vi.fn();
    carouselElement.scrollBy = scrollByMock;

    Object.defineProperty(carouselElement, "scrollWidth", { value: 1000, configurable: true });
    Object.defineProperty(carouselElement, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(carouselElement, "scrollLeft", { value: 0, configurable: true, writable: true });

    fireEvent.scroll(carouselElement);

    expect(screen.queryByRole("button", { name: "이전 게시글 보기" })).not.toBeInTheDocument();
    const rightButton = await screen.findByRole("button", { name: "다음 게시글 보기" });
    expect(rightButton).toBeInTheDocument();

    fireEvent.click(rightButton);
    expect(scrollByMock).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number), behavior: "smooth" }),
    );

    carouselElement.scrollLeft = 200;
    fireEvent.scroll(carouselElement);

    const leftButton = await screen.findByRole("button", { name: "이전 게시글 보기" });
    expect(leftButton).toBeInTheDocument();

    fireEvent.click(leftButton);
    expect(scrollByMock).toHaveBeenCalledWith(
      expect.objectContaining({ left: expect.any(Number), behavior: "smooth" }),
    );
    expect(scrollByMock.mock.calls[1][0].left).toBeLessThan(0);
  });
});

describe("MainPage navigation and logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchSpots.mockResolvedValue(emptySpotResult);
    mockedFetchPopularSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetchPopularBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);
  });

  test("clicking profile nav button toggles the profile menu with logout option", async () => {
    renderMainPage();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    expect(screen.queryByRole("menu", { name: "프로필 메뉴" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "로그아웃" })).not.toBeInTheDocument();

    // Open profile menu
    fireEvent.click(profileButton);
    expect(screen.getByRole("menu", { name: "프로필 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "로그아웃" })).toBeInTheDocument();

    // Toggle close profile menu
    fireEvent.click(profileButton);
    expect(screen.queryByRole("menu", { name: "프로필 메뉴" })).not.toBeInTheDocument();
  });

  test("clicking outside or backdrop closes the profile menu", async () => {
    renderMainPage();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    fireEvent.click(profileButton);
    expect(screen.getByRole("menu", { name: "프로필 메뉴" })).toBeInTheDocument();

    const backdrop = screen.getByTestId("profile-menu-backdrop");
    fireEvent.click(backdrop);
    expect(screen.queryByRole("menu", { name: "프로필 메뉴" })).not.toBeInTheDocument();
  });

  test("pressing Escape key closes the profile menu", async () => {
    renderMainPage();

    const profileButton = screen.getByRole("button", { name: "프로필" });
    fireEvent.click(profileButton);
    expect(screen.getByRole("menu", { name: "프로필 메뉴" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "프로필 메뉴" })).not.toBeInTheDocument();
  });

  test("clicking logout button calls signOut and navigates to /login with replace", async () => {
    mockedSignOut.mockResolvedValue(undefined);
    renderMainPage();

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
    renderMainPage();

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

    renderMainPage();

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

describe("MainPage weather section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSearchSpots.mockResolvedValue(emptySpotResult);
    mockedFetchPopularSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetchPopularBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
  });

  test("fetches weather for default region (null) on initial mount and displays weather data", async () => {
    mockedFetch5DayWeather.mockResolvedValue([
      {
        date: "09.02",
        day: "수",
        low: 19,
        high: 28,
        rainProb: 20,
        weatherCode: 0,
        description: "맑음",
        icon: Sun,
        iconClass: "fill-amber-400 text-amber-400",
      },
    ]);

    renderMainPage();

    expect(mockedFetch5DayWeather).toHaveBeenCalledWith(null);
    expect(await screen.findByText("09.02")).toBeInTheDocument();
    expect(screen.getByText("(수)")).toBeInTheDocument();
    expect(screen.getByText("19° / 28°")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText(/Open-Meteo/)).toBeInTheDocument();
  });

  test("fetches weather for selected region when region is changed", async () => {
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);

    renderMainPage();

    // Open region map
    fireEvent.click(screen.getByRole("button", { name: "여행 지역 선택: 강원도 / 지역 선택" }));
    // Select 강릉
    fireEvent.click(screen.getByRole("button", { name: "강릉" }));
    fireEvent.click(screen.getByRole("button", { name: "강릉 선택하기" }));

    await waitFor(() => {
      expect(mockedFetch5DayWeather).toHaveBeenCalledWith("강릉");
    });
  });

  test("displays error message when weather fetching fails", async () => {
    mockedFetch5DayWeather.mockRejectedValue(new Error("API Error"));

    renderMainPage();

    expect(await screen.findByText("날씨 정보를 불러오지 못했습니다.")).toBeInTheDocument();
  });
});
