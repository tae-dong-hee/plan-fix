import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { MockedFunction } from "vitest";
import { Sun } from "lucide-react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import MainPage from "@/pages/main-page";
import { signOut } from "@/services/auth";
import { fetchBoards, likeBoard, unlikeBoard, type BoardDetail, type BoardItem, type BoardLikeState } from "@/services/board";
import { fetchPublicCourses, likeCourse, unlikeCourse, type CourseResponse, type PublicCourseItem } from "@/services/course";
import {
  fetchRecommendedSpots,
  likeSpot,
  unlikeSpot,
  UnauthorizedError,
} from "@/services/spots";
import { fetch5DayWeather } from "@/services/weather";
import { fetchLikedBoards, fetchLikedCourses, fetchLikedSpots } from "@/services/wishlist";

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
vi.mock("@/services/course");
vi.mock("@/services/wishlist");

const mockedFetchRecommendedSpots = fetchRecommendedSpots as MockedFunction<typeof fetchRecommendedSpots>;
const mockedFetchPublicCourses = vi.mocked(fetchPublicCourses);
const mockedFetchLikedCourses = vi.mocked(fetchLikedCourses);
const mockedLikeCourse = vi.mocked(likeCourse);
const mockedUnlikeCourse = vi.mocked(unlikeCourse);
const mockedFetchBoards = fetchBoards as MockedFunction<typeof fetchBoards>;
const mockedFetchLikedBoards = vi.mocked(fetchLikedBoards);
const mockedLikeBoard = vi.mocked(likeBoard);
const mockedUnlikeBoard = vi.mocked(unlikeBoard);
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

function LocationProbe() {
  return <output data-testid="current-location">{useLocation().pathname}</output>;
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
const recommendedSpot = {
  spotId: 429, title: "경포해수욕장", category: "관광지", region: "51", sigungu: "150",
  thumbnail: "https://example.com/beach.jpg",
};
const recommendedSpotResult = { ...emptySpotResult, items: [recommendedSpot], totalCount: 1 };

const publicCourse: PublicCourseItem = {
  courseId: 31,
  userId: 5,
  title: "강릉 바다 여행 코스",
  description: "해변과 카페를 둘러보는 일정",
  thumbnail: "https://example.com/course.jpg",
  viewCount: 20,
  likeCount: 3,
  dayCount: 2,
  spotCount: 4,
  startDate: "2026-09-20",
  endDate: "2026-09-21",
  createdAt: "2026-09-12T00:00:00Z",
};
const publicCourseResult = { items: [publicCourse], offset: 0, size: 20, totalCount: 1 };
const likedCourse: CourseResponse = {
  ...publicCourse,
  visibility: "PUBLIC",
  status: "ACTIVE",
  days: [],
  updatedAt: publicCourse.createdAt,
};
const publicBoard: BoardItem = {
  boardId: 101,
  title: "강릉 카페 투어 추천",
  thumbnail: null,
  userId: 1,
  likeCount: 12,
  viewCount: 150,
  commentCount: 5,
  createdAt: "2026-09-01T10:00:00Z",
};
const likedBoard: BoardDetail = {
  ...publicBoard,
  courseId: null,
  content: "강릉에서 보낸 하루",
  status: "ACTIVE",
  images: [],
  isLiked: true,
  updatedAt: publicBoard.createdAt,
};
const publicBoardResult = { items: [publicBoard], offset: 0, size: 6, totalCount: 1 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

beforeEach(() => {
  mockedFetchBoards.mockReset().mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
  mockedFetchPublicCourses.mockReset().mockResolvedValue({ items: [], offset: 0, size: 20, totalCount: 0 });
  mockedFetchLikedCourses.mockReset().mockResolvedValue([]);
  mockedFetchLikedBoards.mockReset().mockResolvedValue([]);
  vi.mocked(fetchLikedSpots).mockReset().mockResolvedValue([]);
  mockedLikeCourse.mockReset().mockResolvedValue({ liked: true, likeCount: 4 });
  mockedUnlikeCourse.mockReset().mockResolvedValue({ liked: false, likeCount: 2 });
  mockedLikeBoard.mockReset().mockResolvedValue({ liked: true, likeCount: 13 });
  mockedUnlikeBoard.mockReset().mockResolvedValue({ liked: false, likeCount: 11 });
});

describe("MainPage public course carousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchRecommendedSpots.mockResolvedValue(emptySpotResult);
    mockedFetchBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);
  });

  test.each([
    ["춘천", "110"], ["원주", "130"], ["강릉", "150"],
    ["동해", "170"], ["태백", "190"], ["속초", "210"], ["삼척", "230"],
    ["홍천", "720"], ["횡성", "730"], ["영월", "750"], ["평창", "760"],
    ["정선", "770"], ["철원", "780"], ["화천", "790"], ["양구", "800"],
    ["인제", "810"], ["고성", "820"], ["양양", "830"],
  ])("%s 선택 시 인기 장소는 시군 코드 %s로 조회하고 공개 코스는 그대로 유지한다", async (region, sigungu) => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    renderMainPage();
    await screen.findByText(publicCourse.title);

    fireEvent.click(screen.getByRole("button", { name: "여행 지역 선택: 강원도 / 지역 선택" }));
    fireEvent.click(screen.getByRole("button", { name: region }));
    fireEvent.click(screen.getByRole("button", { name: `${region} 선택하기` }));

    await waitFor(() => {
      expect(mockedFetchRecommendedSpots).toHaveBeenLastCalledWith({
        region: "51",
        sigungu,
        size: 20,
      });
    });
    expect(mockedFetchPublicCourses).toHaveBeenCalledExactlyOnceWith({ sort: "random", size: 20 });
    expect(mockedFetchLikedCourses).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "강원도에서 뭐 하지?" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "강원도에서 뭐 하지? 전체보기" })).toHaveAttribute("href", "/courses/public");
  });

  test("무작위 공개 코스와 찜 상태를 조회하고 코스 상세 및 전체 목록으로 연결한다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    renderMainPage();

    expect(mockedFetchPublicCourses).toHaveBeenCalledWith({ sort: "random", size: 20 });
    expect(mockedFetchLikedCourses).toHaveBeenCalledTimes(1);
    expect((await screen.findByText(publicCourse.title)).closest("a")).toHaveAttribute(
      "href",
      "/courses/31",
    );
    expect(screen.getByText("다른 여행자들이 공유한 코스로 여행을 계획해 보세요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "강원도에서 뭐 하지? 전체보기" })).toHaveAttribute(
      "href",
      "/courses/public",
    );
  });

  test("다른 페이지에서 돌아오거나 메인으로 다시 이동하면 코스와 추천 장소를 새로 조회한다", async () => {
    const nextCourse = { ...publicCourse, courseId: 32, title: "춘천 호수 여행 코스" };
    const lastCourse = { ...publicCourse, courseId: 33, title: "속초 산책 코스" };
    const nextSpot = { ...recommendedSpot, spotId: 4, title: "남이섬", sigungu: "110" };
    const lastSpot = { ...recommendedSpot, spotId: 4705, title: "낙산사", sigungu: "830" };
    mockedFetchRecommendedSpots
      .mockResolvedValueOnce(recommendedSpotResult)
      .mockResolvedValueOnce({ ...recommendedSpotResult, items: [nextSpot] })
      .mockResolvedValueOnce({ ...recommendedSpotResult, items: [lastSpot] });
    mockedFetchPublicCourses
      .mockResolvedValueOnce(publicCourseResult)
      .mockResolvedValueOnce({ ...publicCourseResult, items: [nextCourse] })
      .mockResolvedValueOnce({ ...publicCourseResult, items: [lastCourse] });
    render(
      <MemoryRouter initialEntries={["/main"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Link to="/other">다른 페이지</Link>
        <Link to="/main">메인으로 이동</Link>
        <Routes>
          <Route path="/main" element={<MainPage />} />
          <Route path="/other" element={<p>다른 화면</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText(publicCourse.title);
    await screen.findByText(recommendedSpot.title);

    fireEvent.click(screen.getByRole("link", { name: "다른 페이지" }));
    expect(screen.queryByText(publicCourse.title)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "메인으로 이동" }));
    expect(await screen.findByText(nextCourse.title)).toBeInTheDocument();
    expect(await screen.findByText(nextSpot.title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "메인으로 이동" }));
    expect(await screen.findByText(lastCourse.title)).toBeInTheDocument();
    expect(await screen.findByText(lastSpot.title)).toBeInTheDocument();
    expect(screen.queryByText(nextCourse.title)).not.toBeInTheDocument();
    expect(screen.queryByText(nextSpot.title)).not.toBeInTheDocument();
    expect(mockedFetchPublicCourses).toHaveBeenCalledTimes(3);
    expect(mockedFetchPublicCourses).toHaveBeenLastCalledWith({ sort: "random", size: 20 });
    expect(mockedFetchRecommendedSpots).toHaveBeenCalledTimes(3);
    expect(mockedFetchRecommendedSpots).toHaveBeenLastCalledWith({ region: "51", sigungu: undefined, size: 20 });
  });

  test("새로고침처럼 페이지를 다시 마운트하면 코스와 추천 장소를 새로 조회한다", async () => {
    mockedFetchPublicCourses.mockResolvedValueOnce(publicCourseResult);
    mockedFetchRecommendedSpots.mockResolvedValueOnce(recommendedSpotResult);
    const firstPage = renderMainPage();
    await screen.findByText(publicCourse.title);
    await screen.findByText(recommendedSpot.title);
    firstPage.unmount();

    const nextCourse = { ...publicCourse, courseId: 32, title: "춘천 호수 여행 코스" };
    mockedFetchPublicCourses.mockResolvedValueOnce({ ...publicCourseResult, items: [nextCourse] });
    const nextSpot = { ...recommendedSpot, spotId: 4, title: "남이섬", sigungu: "110" };
    mockedFetchRecommendedSpots.mockResolvedValueOnce({ ...recommendedSpotResult, items: [nextSpot] });
    renderMainPage();

    expect(await screen.findByText(nextCourse.title)).toBeInTheDocument();
    expect(await screen.findByText(nextSpot.title)).toBeInTheDocument();
    expect(screen.queryByText(publicCourse.title)).not.toBeInTheDocument();
    expect(screen.queryByText(recommendedSpot.title)).not.toBeInTheDocument();
    expect(mockedFetchPublicCourses).toHaveBeenCalledTimes(2);
    expect(mockedFetchPublicCourses).toHaveBeenLastCalledWith({ sort: "random", size: 20 });
    expect(mockedFetchRecommendedSpots).toHaveBeenCalledTimes(2);
  });

  test("여행 코스 카드를 좌우로 넘길 수 있다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    renderMainPage();
    const carousel = await screen.findByLabelText("여행 코스");
    const scrollBy = vi.fn();
    carousel.scrollBy = scrollBy;
    Object.defineProperties(carousel, {
      scrollWidth: { value: 1000, configurable: true },
      clientWidth: { value: 300, configurable: true },
      scrollLeft: { value: 0, configurable: true, writable: true },
    });

    fireEvent.scroll(carousel);
    fireEvent.click(await screen.findByRole("button", { name: "다음 여행 코스 보기" }));
    expect(scrollBy).toHaveBeenCalledWith({ left: 200, behavior: "smooth" });

    carousel.scrollLeft = 200;
    fireEvent.scroll(carousel);
    fireEvent.click(await screen.findByRole("button", { name: "이전 여행 코스 보기" }));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -200, behavior: "smooth" });
  });

  test("코스 좋아요와 취소는 코스 API만 호출한다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    renderMainPage();
    const likeButton = await screen.findByRole("button", { name: `${publicCourse.title} 좋아요` });
    await waitFor(() => expect(likeButton).toBeEnabled());
    fireEvent.click(likeButton);
    expect(mockedLikeCourse).toHaveBeenCalledWith(31);
    const unlikeButton = await screen.findByRole("button", { name: `${publicCourse.title} 좋아요 취소` });
    await waitFor(() => expect(unlikeButton).toBeEnabled());
    fireEvent.click(unlikeButton);
    expect(mockedUnlikeCourse).toHaveBeenCalledWith(31);
    expect(mockedLikeSpot).not.toHaveBeenCalled();
    expect(mockedUnlikeSpot).not.toHaveBeenCalled();
    expect(mockedFetchPublicCourses).toHaveBeenCalledTimes(1);
  });

  test("기존에 찜한 코스는 하트가 선택되어 있고 첫 클릭으로 취소한다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    mockedFetchLikedCourses.mockResolvedValue([likedCourse]);
    renderMainPage();
    const button = await screen.findByRole("button", { name: `${publicCourse.title} 좋아요 취소` });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(mockedUnlikeCourse).toHaveBeenCalledWith(31);
    expect(mockedLikeCourse).not.toHaveBeenCalled();
  });

  test("초기 찜 목록이 도착할 때까지 코스 좋아요 버튼을 잠근다", async () => {
    const likedRequest = deferred<CourseResponse[]>();
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    mockedFetchLikedCourses.mockReturnValue(likedRequest.promise);
    renderMainPage();
    await screen.findByText(publicCourse.title);
    const button = screen.getByRole("button", { name: `${publicCourse.title} 좋아요` });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockedLikeCourse).not.toHaveBeenCalled();

    await act(async () => likedRequest.resolve([likedCourse]));
    expect(screen.getByRole("button", { name: `${publicCourse.title} 좋아요 취소` })).toBeEnabled();
  });

  test("찜 상태 조회 실패는 코스를 계속 보여주고 재확인할 때까지 하트를 잠근다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    mockedFetchLikedCourses.mockRejectedValueOnce(new Error("Server unavailable")).mockResolvedValueOnce([likedCourse]);
    renderMainPage();

    expect(await screen.findByText(publicCourse.title)).toBeInTheDocument();
    expect(await screen.findByText("코스 찜 상태를 불러오지 못했습니다.")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: `${publicCourse.title} 좋아요` });
    expect(button).toBeDisabled();
    expect(button.querySelector(".animate-spin")).toBeNull();
    fireEvent.click(button);
    expect(mockedLikeCourse).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "찜 상태 다시 확인" }));
    const unlikeButton = await screen.findByRole("button", { name: `${publicCourse.title} 좋아요 취소` });
    await waitFor(() => expect(unlikeButton).toBeEnabled());
    expect(mockedFetchPublicCourses).toHaveBeenCalledTimes(2);
    expect(mockedFetchLikedCourses).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("코스 찜 상태를 불러오지 못했습니다.")).not.toBeInTheDocument();
    fireEvent.click(unlikeButton);
    expect(mockedUnlikeCourse).toHaveBeenCalledExactlyOnceWith(31);
    expect(mockedLikeCourse).not.toHaveBeenCalled();
  });

  test("비로그인 찜 상태 조회는 공개 코스와 하트를 열어두고 찜 클릭 시 로그인을 요청한다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    mockedFetchLikedCourses.mockRejectedValue(new UnauthorizedError());
    mockedLikeCourse.mockRejectedValue(new UnauthorizedError());
    renderMainPage();

    expect(await screen.findByText(publicCourse.title)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: `${publicCourse.title} 좋아요` });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByText("코스 찜 상태를 불러오지 못했습니다.")).not.toBeInTheDocument();
    expect(mockedNavigate).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(mockedNavigate).toHaveBeenCalledWith("/login"));
    expect(mockedLikeCourse).toHaveBeenCalledExactlyOnceWith(31);
  });

  test("코스와 장소 ID가 같아도 각각의 찜 상태를 따로 관리한다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    mockedFetchRecommendedSpots.mockResolvedValue({
      items: [{ spotId: 31, title: "경포해변", category: "관광지", region: "51", sigungu: "150", thumbnail: null, isLiked: false }],
      offset: 0, size: 20, totalCount: 1,
    });
    mockedLikeSpot.mockResolvedValue({ liked: true, likeCount: 1 });
    renderMainPage();
    const courseButton = await screen.findByRole("button", { name: `${publicCourse.title} 좋아요` });
    await waitFor(() => expect(courseButton).toBeEnabled());
    fireEvent.click(courseButton);
    expect(await screen.findByRole("button", { name: `${publicCourse.title} 좋아요 취소` })).toHaveAttribute("aria-pressed", "true");
    const spotButton = screen.getByRole("button", { name: "경포해변 좋아요" });
    expect(spotButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(spotButton);
    expect(mockedLikeSpot).toHaveBeenCalledWith(31);
    expect(mockedLikeCourse).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: `${publicCourse.title} 좋아요 취소` })).toHaveAttribute("aria-pressed", "true");
  });

  test("좋아요 실패 시 원래 상태로 되돌리고 오류를 알려준다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    mockedLikeCourse.mockRejectedValue(new Error("좋아요 처리에 실패했습니다."));
    renderMainPage();
    const button = await screen.findByRole("button", { name: `${publicCourse.title} 좋아요` });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("코스 찜을 변경하지 못했습니다.");
    expect(screen.getByRole("button", { name: `${publicCourse.title} 좋아요` })).toHaveAttribute("aria-pressed", "false");
  });

  test("좋아요 요청이 인증 오류면 로그인으로 이동한다", async () => {
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    mockedLikeCourse.mockRejectedValue(new UnauthorizedError());
    renderMainPage();
    const button = await screen.findByRole("button", { name: `${publicCourse.title} 좋아요` });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    await waitFor(() => expect(mockedNavigate).toHaveBeenCalledWith("/login"));
    expect(screen.getByRole("button", { name: `${publicCourse.title} 좋아요` })).toHaveAttribute("aria-pressed", "false");
  });

  test("코스 목록 조회 중에는 로딩 상태를 보여준다", async () => {
    const request = deferred<Awaited<ReturnType<typeof fetchPublicCourses>>>();
    mockedFetchPublicCourses.mockReturnValue(request.promise);
    renderMainPage();
    expect(screen.getByText(/코스를 불러오는 중/)).toBeInTheDocument();

    await act(async () => request.resolve(publicCourseResult));
    expect(screen.getByText(publicCourse.title)).toBeInTheDocument();
    expect(screen.queryByText(/코스를 불러오는 중/)).not.toBeInTheDocument();
  });

  test("공개 코스가 없으면 빈 목록 안내를 표시한다", async () => {
    renderMainPage();
    expect(await screen.findByText("공개된 여행 코스가 아직 없어요.")).toBeInTheDocument();
    expect(screen.queryByLabelText("여행 코스")).not.toBeInTheDocument();
  });

  test("코스 조회 오류 후 다시 시도하면 코스와 찜 상태를 다시 불러온다", async () => {
    mockedFetchPublicCourses.mockRejectedValueOnce(new Error("Network failed")).mockResolvedValueOnce(publicCourseResult);
    renderMainPage();
    fireEvent.click(await screen.findByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText(publicCourse.title)).toBeInTheDocument();
    expect(mockedFetchPublicCourses).toHaveBeenCalledTimes(2);
    expect(mockedFetchLikedCourses).toHaveBeenCalledTimes(2);
  });
});

describe("MainPage popular spots carousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);
  });

  test("fetches curated Gangwon recommendations with size 20 on initial load", async () => {
    mockedFetchRecommendedSpots.mockResolvedValue({
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

    expect(mockedFetchRecommendedSpots).toHaveBeenCalledWith({
      region: "51",
      sigungu: undefined,
      size: 20,
    });

    expect(await screen.findByText("경포해변")).toBeInTheDocument();
    expect(screen.getByText("안목해변")).toBeInTheDocument();
  });

  test("shows empty message when fetch returns empty list", async () => {
    mockedFetchRecommendedSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });

    renderMainPage();

    expect(await screen.findByText("표시할 인기 장소가 없어요.")).toBeInTheDocument();
  });

  test("인기 장소를 조회하는 동안 로딩 상태를 표시한다", async () => {
    const request = deferred<Awaited<ReturnType<typeof fetchRecommendedSpots>>>();
    mockedFetchRecommendedSpots.mockReturnValueOnce(request.promise);
    renderMainPage();

    expect(screen.getByText("강원도 인기 장소를 불러오는 중...")).toBeInTheDocument();
    expect(screen.queryByText("표시할 인기 장소가 없어요.")).not.toBeInTheDocument();

    await act(async () => request.resolve(emptySpotResult));
    expect(screen.queryByText(/인기 장소를 불러오는 중/)).not.toBeInTheDocument();
    expect(screen.getByText("표시할 인기 장소가 없어요.")).toBeInTheDocument();
  });

  test("지역 변경 후 조회에 실패하면 선택한 지역을 유지하며 다시 시도한다", async () => {
    const retry = deferred<Awaited<ReturnType<typeof fetchRecommendedSpots>>>();
    mockedFetchRecommendedSpots
      .mockResolvedValueOnce(emptySpotResult)
      .mockRejectedValueOnce(new Error("Network failed"))
      .mockReturnValueOnce(retry.promise);
    renderMainPage();
    await screen.findByText("표시할 인기 장소가 없어요.");

    fireEvent.click(screen.getByRole("button", { name: "여행 지역 선택: 강원도 / 지역 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "속초" }));
    fireEvent.click(screen.getByRole("button", { name: "속초 선택하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("인기 장소를 불러오지 못했습니다.");
    expect(screen.queryByText("표시할 인기 장소가 없어요.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "인기 장소 다시 시도" }));

    expect(screen.getByText("속초 인기 장소를 불러오는 중...")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mockedFetchRecommendedSpots).toHaveBeenCalledTimes(3);
    expect(mockedFetchRecommendedSpots).toHaveBeenLastCalledWith({ region: "51", sigungu: "210", size: 20 });

    await act(async () => retry.resolve({
      items: [{ spotId: 10, title: "속초해수욕장", category: "관광지", region: "51", sigungu: "210", thumbnail: null }],
      offset: 0,
      size: 20,
      totalCount: 1,
    }));
    expect(screen.getByText("속초해수욕장")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "여행 지역 선택: 강원도 / 속초" })).toBeInTheDocument();
    expect(screen.queryByText(/인기 장소를 불러오는 중/)).not.toBeInTheDocument();
  });

  test("지역을 바꾼 뒤 도착한 이전 지역 응답이 현재 인기 장소를 덮어쓰지 않는다", async () => {
    const previousRequest = deferred<Awaited<ReturnType<typeof fetchRecommendedSpots>>>();
    mockedFetchRecommendedSpots.mockReturnValueOnce(previousRequest.promise).mockResolvedValueOnce({
      items: [{ spotId: 10, title: "속초해수욕장", category: "관광지", region: "51", sigungu: "210", thumbnail: null }],
      offset: 0,
      size: 20,
      totalCount: 1,
    });
    renderMainPage();
    fireEvent.click(screen.getByRole("button", { name: "여행 지역 선택: 강원도 / 지역 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "속초" }));
    fireEvent.click(screen.getByRole("button", { name: "속초 선택하기" }));
    await screen.findByText("속초해수욕장");

    await act(async () => previousRequest.resolve(emptySpotResult));
    expect(screen.getByText("속초해수욕장")).toBeInTheDocument();
    expect(screen.queryByText("표시할 인기 장소가 없어요.")).not.toBeInTheDocument();
  });

  test("clicking '인기 장소 더보기' navigates to /spots/popular", async () => {
    mockedFetchRecommendedSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });

    renderMainPage();

    const moreButton = screen.getByRole("button", { name: "인기 장소 더보기" });
    fireEvent.click(moreButton);

    expect(mockedNavigate).toHaveBeenCalledWith("/spots/popular");
  });

  test("clicking '인기 장소 더보기' with selected region navigates to /spots/popular with region query", async () => {
    mockedFetchRecommendedSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });

    renderMainPage();

    fireEvent.click(screen.getByRole("button", { name: "여행 지역 선택: 강원도 / 지역 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "강릉" }));
    fireEvent.click(screen.getByRole("button", { name: "강릉 선택하기" }));

    const moreButton = screen.getByRole("button", { name: "인기 장소 더보기" });
    fireEvent.click(moreButton);

    expect(mockedNavigate).toHaveBeenCalledWith("/spots/popular?region=%EA%B0%95%EB%A6%89");
  });

  test("carousel arrow buttons scroll the carousel left and right based on scroll position", async () => {
    mockedFetchRecommendedSpots.mockResolvedValue({
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
    mockedFetchRecommendedSpots.mockResolvedValue({
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
    expect(mockedFetchRecommendedSpots).toHaveBeenCalledTimes(1);
  });

  test("restores the spot like state and requests login when authentication is required", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    mockedFetchRecommendedSpots.mockResolvedValue({
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

    expect(screen.getByRole("button", { name: "오죽헌 좋아요" })).toHaveAttribute("aria-pressed", "false");
    expect(alertSpy).toHaveBeenCalledWith("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
    expect(mockedNavigate).toHaveBeenCalledWith("/login");
    alertSpy.mockRestore();
  });
});

describe("MainPage travel story likes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchRecommendedSpots.mockResolvedValue(emptySpotResult);
    mockedFetchBoards.mockResolvedValue(publicBoardResult);
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);
  });

  test("같은 좋아요 버튼으로 이야기를 저장하고 다시 눌러 취소하며 서버의 개수로 갱신한다", async () => {
    render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MainPage />
        <LocationProbe />
      </MemoryRouter>,
    );
    const button = await screen.findByRole("button", { name: `${publicBoard.title} 좋아요` });
    await waitFor(() => expect(button).toBeEnabled());
    expect(within(button).getByText("좋아요")).toBeInTheDocument();
    expect(within(button).getByText("12")).toBeInTheDocument();
    expect(button.closest("a")).toBeNull();
    expect(screen.getByRole("heading", { name: publicBoard.title }).closest("a")).toHaveAttribute("href", "/boards/101");

    mockedLikeBoard.mockResolvedValue({ liked: true, likeCount: 20 });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveAccessibleName(`${publicBoard.title} 좋아요`);
    expect(within(button).getByText("좋아요")).toBeInTheDocument();
    expect(button).not.toHaveTextContent("취소");
    expect(within(button).getByText("20")).toBeInTheDocument();
    expect(mockedLikeBoard).toHaveBeenCalledExactlyOnceWith(101);
    expect(screen.getByTestId("current-location")).toHaveTextContent(/^\/$/);

    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(button).toHaveAccessibleName(`${publicBoard.title} 좋아요`);
    expect(within(button).getByText("좋아요")).toBeInTheDocument();
    expect(within(button).getByText("11")).toBeInTheDocument();
    expect(mockedUnlikeBoard).toHaveBeenCalledExactlyOnceWith(101);
    expect(screen.getByTestId("current-location")).toHaveTextContent(/^\/$/);
    expect(mockedLikeCourse).not.toHaveBeenCalled();
    expect(mockedLikeSpot).not.toHaveBeenCalled();
  });

  test("이미 좋아요한 이야기는 초기 선택 상태를 불러오고 첫 클릭으로 취소한다", async () => {
    const request = deferred<BoardDetail[]>();
    mockedFetchLikedBoards.mockReturnValue(request.promise);
    renderMainPage();
    const button = await screen.findByRole("button", { name: `${publicBoard.title} 좋아요` });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockedLikeBoard).not.toHaveBeenCalled();

    await act(async () => request.resolve([likedBoard]));
    expect(button).toHaveAccessibleName(`${publicBoard.title} 좋아요`);
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(mockedUnlikeBoard).toHaveBeenCalledExactlyOnceWith(101);
    expect(mockedLikeBoard).not.toHaveBeenCalled();
  });

  test("이야기 좋아요 상태 조회 실패 시 재확인 전까지 버튼을 잠근다", async () => {
    mockedFetchLikedBoards.mockRejectedValueOnce(new Error("Network failed")).mockResolvedValueOnce([likedBoard]);
    renderMainPage();
    expect(await screen.findByText("이야기 좋아요 상태를 불러오지 못했습니다.")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: `${publicBoard.title} 좋아요` });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mockedLikeBoard).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "좋아요 상태 다시 확인" }));
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(mockedFetchLikedBoards).toHaveBeenCalledTimes(2);
    expect(mockedFetchBoards).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("이야기 좋아요 상태를 불러오지 못했습니다.")).not.toBeInTheDocument();
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(mockedUnlikeBoard).toHaveBeenCalledExactlyOnceWith(101);
  });

  test("이야기 좋아요 요청 중 중복 클릭을 막는다", async () => {
    const request = deferred<BoardLikeState>();
    mockedLikeBoard.mockReturnValue(request.promise);
    renderMainPage();
    const button = await screen.findByRole("button", { name: `${publicBoard.title} 좋아요` });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(mockedLikeBoard).toHaveBeenCalledExactlyOnceWith(101);
    await act(async () => request.resolve({ liked: true, likeCount: 13 }));
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  test("이야기 좋아요 요청 실패는 상태와 개수를 유지하고 재시도할 수 있다", async () => {
    mockedLikeBoard.mockRejectedValueOnce(new Error("Network failed"));
    renderMainPage();
    const button = await screen.findByRole("button", { name: `${publicBoard.title} 좋아요` });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("이야기 좋아요를 변경하지 못했습니다.");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(within(button).getByText("12")).toBeInTheDocument();

    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mockedLikeBoard).toHaveBeenCalledTimes(2);
  });

  test("비로그인 사용자는 이야기를 볼 수 있고 좋아요 클릭 시 로그인으로 이동한다", async () => {
    mockedFetchLikedBoards.mockRejectedValue(new UnauthorizedError());
    mockedLikeBoard.mockRejectedValue(new Error("로그인이 필요합니다."));
    renderMainPage();
    const button = await screen.findByRole("button", { name: `${publicBoard.title} 좋아요` });
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByText("이야기 좋아요 상태를 불러오지 못했습니다.")).not.toBeInTheDocument();
    expect(mockedNavigate).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(mockedNavigate).toHaveBeenCalledWith("/login"));
    expect(button).toHaveAttribute("aria-pressed", "false");
  });
});

describe("MainPage travel story sorting and carousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchRecommendedSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetch5DayWeather.mockResolvedValue(mockWeatherItems);
  });

  test("fetches popular boards with size 6 on initial load and renders cards", async () => {
    mockedFetchBoards.mockResolvedValue({
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

    expect(mockedFetchBoards).toHaveBeenCalledWith({ sort: "popular", size: 6 });

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

  test("shows empty message when boards returns an empty list", async () => {
    mockedFetchBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });

    renderMainPage();

    expect(await screen.findByText("표시할 게시글이 없어요.")).toBeInTheDocument();
  });

  test("인기순을 기본으로 표시하고 최신순과 인기순을 선택할 때 서버 목록을 새로 조회한다", async () => {
    const latestRequest = deferred<Awaited<ReturnType<typeof fetchBoards>>>();
    const latestBoards = [
      { ...publicBoard, boardId: 201, title: "오늘 떠난 양양 여행", likeCount: 1, createdAt: "2026-09-19T10:00:00Z" },
      { ...publicBoard, boardId: 202, title: "어제 떠난 춘천 여행", likeCount: 50, createdAt: "2026-09-18T10:00:00Z" },
    ];
    mockedFetchBoards
      .mockResolvedValueOnce(publicBoardResult)
      .mockReturnValueOnce(latestRequest.promise)
      .mockResolvedValueOnce(publicBoardResult);
    renderMainPage();
    const stories = screen.getByRole("region", { name: "여행 이야기" });
    const sorting = within(stories).getByRole("group", { name: "여행 이야기 정렬" });
    const popularButton = within(sorting).getByRole("button", { name: "인기순" });
    const latestButton = within(sorting).getByRole("button", { name: "최신순" });
    expect(popularButton).toHaveAttribute("aria-pressed", "true");
    expect(latestButton).toHaveAttribute("aria-pressed", "false");
    await within(stories).findByRole("heading", { name: publicBoard.title });

    fireEvent.click(latestButton);
    expect(mockedFetchBoards).toHaveBeenNthCalledWith(2, { sort: "latest", size: 6 });
    expect(latestButton).toHaveAttribute("aria-pressed", "true");
    expect(popularButton).toHaveAttribute("aria-pressed", "false");
    expect(within(stories).getByRole("status")).toHaveTextContent("여행 이야기를 불러오는 중...");
    expect(within(stories).queryByRole("heading", { name: publicBoard.title })).not.toBeInTheDocument();

    await act(async () => latestRequest.resolve({ ...publicBoardResult, items: latestBoards, totalCount: 2 }));
    expect(within(stories).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(
      latestBoards.map((board) => board.title),
    );
    expect(within(stories).queryByRole("status")).not.toBeInTheDocument();

    fireEvent.click(popularButton);
    expect(await within(stories).findByRole("heading", { name: publicBoard.title })).toBeInTheDocument();
    expect(within(stories).queryByText(latestBoards[0].title)).not.toBeInTheDocument();
    expect(mockedFetchBoards).toHaveBeenNthCalledWith(3, { sort: "popular", size: 6 });
    expect(popularButton).toHaveAttribute("aria-pressed", "true");
    expect(latestButton).toHaveAttribute("aria-pressed", "false");
    expect(mockedFetchPublicCourses).toHaveBeenCalledTimes(1);
    expect(mockedFetchRecommendedSpots).toHaveBeenCalledTimes(1);
  });

  test("정렬을 바꾼 뒤 늦게 도착한 이전 정렬 응답은 현재 목록을 덮어쓰지 않는다", async () => {
    const popularRequest = deferred<Awaited<ReturnType<typeof fetchBoards>>>();
    const latestBoard = { ...publicBoard, boardId: 201, title: "방금 올린 속초 여행 이야기" };
    mockedFetchBoards
      .mockReturnValueOnce(popularRequest.promise)
      .mockResolvedValueOnce({ ...publicBoardResult, items: [latestBoard] });
    renderMainPage();
    const sorting = screen.getByRole("group", { name: "여행 이야기 정렬" });

    fireEvent.click(within(sorting).getByRole("button", { name: "최신순" }));
    await screen.findByRole("heading", { name: latestBoard.title });
    await act(async () => popularRequest.resolve(publicBoardResult));

    expect(screen.getByRole("heading", { name: latestBoard.title })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: publicBoard.title })).not.toBeInTheDocument();
    expect(within(sorting).getByRole("button", { name: "최신순" })).toHaveAttribute("aria-pressed", "true");
  });

  test("정렬을 바꿔도 방금 누른 좋아요를 유지하고 위시리스트를 다시 조회하지 않는다", async () => {
    mockedFetchBoards.mockResolvedValue(publicBoardResult);
    renderMainPage();
    const likeButton = await screen.findByRole("button", { name: `${publicBoard.title} 좋아요` });
    await waitFor(() => expect(likeButton).toBeEnabled());
    fireEvent.click(likeButton);
    await waitFor(() => expect(likeButton).toHaveAttribute("aria-pressed", "true"));
    await waitFor(() => expect(likeButton).toBeEnabled());

    const sorting = screen.getByRole("group", { name: "여행 이야기 정렬" });
    for (const sort of ["최신순", "인기순"]) {
      fireEvent.click(within(sorting).getByRole("button", { name: sort }));
      const button = await screen.findByRole("button", { name: `${publicBoard.title} 좋아요` });
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(button).toBeEnabled();
    }

    expect(mockedFetchLikedBoards).toHaveBeenCalledTimes(1);
    expect(mockedFetchBoards).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole("button", { name: `${publicBoard.title} 좋아요` }));
    await waitFor(() => expect(mockedUnlikeBoard).toHaveBeenCalledExactlyOnceWith(publicBoard.boardId));
    expect(mockedLikeBoard).toHaveBeenCalledExactlyOnceWith(publicBoard.boardId);
  });

  test("최신순 조회 실패를 빈 목록과 구분하고 재시도할 때 선택한 정렬을 유지한다", async () => {
    const latestBoard = { ...publicBoard, boardId: 201, title: "새로 올라온 여행 이야기" };
    mockedFetchBoards
      .mockResolvedValueOnce(publicBoardResult)
      .mockRejectedValueOnce(new Error("Network failed"))
      .mockResolvedValueOnce({ ...publicBoardResult, items: [latestBoard] });
    renderMainPage();
    await screen.findByRole("heading", { name: publicBoard.title });
    const sorting = screen.getByRole("group", { name: "여행 이야기 정렬" });

    fireEvent.click(within(sorting).getByRole("button", { name: "최신순" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("여행 이야기를 불러오지 못했습니다. 다시 시도해 주세요.");
    expect(screen.queryByText("표시할 게시글이 없어요.")).not.toBeInTheDocument();
    expect(within(sorting).getByRole("button", { name: "최신순" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "이야기 다시 불러오기" }));
    expect(await screen.findByRole("heading", { name: latestBoard.title })).toBeInTheDocument();
    expect(mockedFetchBoards).toHaveBeenNthCalledWith(3, { sort: "latest", size: 6 });
    expect(mockedFetchLikedBoards).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(sorting).getByRole("button", { name: "최신순" })).toHaveAttribute("aria-pressed", "true");
  });

  test("정렬을 불러오는 동안 완료된 좋아요 개수를 늦게 도착한 목록 응답이 되돌리지 않는다", async () => {
    const likeRequest = deferred<BoardLikeState>();
    const latestRequest = deferred<Awaited<ReturnType<typeof fetchBoards>>>();
    mockedLikeBoard.mockReturnValueOnce(likeRequest.promise);
    mockedFetchBoards.mockResolvedValueOnce(publicBoardResult).mockReturnValueOnce(latestRequest.promise);
    renderMainPage();
    const likeButton = await screen.findByRole("button", { name: `${publicBoard.title} 좋아요` });
    await waitFor(() => expect(likeButton).toBeEnabled());
    fireEvent.click(likeButton);
    expect(likeButton).toBeDisabled();

    fireEvent.click(within(screen.getByRole("group", { name: "여행 이야기 정렬" })).getByRole("button", { name: "최신순" }));
    await act(async () => likeRequest.resolve({ liked: true, likeCount: 20 }));
    await act(async () => latestRequest.resolve(publicBoardResult));

    const sortedLikeButton = screen.getByRole("button", { name: `${publicBoard.title} 좋아요` });
    expect(sortedLikeButton).toHaveAttribute("aria-pressed", "true");
    expect(sortedLikeButton).toBeEnabled();
    expect(within(sortedLikeButton).getByText("20")).toBeInTheDocument();
    expect(within(sortedLikeButton).queryByText("12")).not.toBeInTheDocument();
    expect(mockedFetchLikedBoards).toHaveBeenCalledTimes(1);
  });

  test("정렬을 바꾸면 새 이야기 목록을 캐러셀의 처음부터 보여준다", async () => {
    const latestRequest = deferred<Awaited<ReturnType<typeof fetchBoards>>>();
    const latestBoard = { ...publicBoard, boardId: 201, title: "새로운 강릉 여행 이야기" };
    mockedFetchBoards.mockResolvedValueOnce(publicBoardResult).mockReturnValueOnce(latestRequest.promise);
    renderMainPage();
    const heading = await screen.findByRole("heading", { name: publicBoard.title });
    const carousel = heading.closest(".overflow-x-auto") as HTMLElement;
    Object.defineProperties(carousel, {
      scrollWidth: { value: 1000, configurable: true },
      clientWidth: { value: 300, configurable: true },
      scrollLeft: { value: 400, configurable: true, writable: true },
    });
    fireEvent.scroll(carousel);
    expect(await screen.findByRole("button", { name: "이전 게시글 보기" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("group", { name: "여행 이야기 정렬" })).getByRole("button", { name: "최신순" }));
    await act(async () => latestRequest.resolve({ ...publicBoardResult, items: [latestBoard] }));
    const nextCarousel = screen.getByRole("heading", { name: latestBoard.title }).closest(".overflow-x-auto") as HTMLElement;
    expect(nextCarousel.scrollLeft).toBe(0);
    expect(screen.queryByRole("button", { name: "이전 게시글 보기" })).not.toBeInTheDocument();
  });

  test("board carousel arrow buttons scroll the board carousel left and right based on scroll position", async () => {
    mockedFetchBoards.mockResolvedValue({
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
    mockedFetchRecommendedSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetchBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
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
    mockedFetchRecommendedSpots.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetchBoards.mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
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

describe("MainPage travel header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchPublicCourses.mockResolvedValue(publicCourseResult);
    mockedFetchRecommendedSpots.mockReset().mockResolvedValue(emptySpotResult);
    mockedFetchBoards.mockReset().mockResolvedValue({ items: [], offset: 0, size: 6, totalCount: 0 });
    mockedFetch5DayWeather.mockReset().mockResolvedValue(mockWeatherItems);
  });

  test.each([
    ["강릉", "150"], ["속초", "210"], ["양양", "830"],
    ["춘천", "110"], ["평창", "760"], ["원주", "130"],
  ])("%s 바로 선택은 날씨와 장소 지역만 변경한다", async (region, sigungu) => {
    renderMainPage();
    await screen.findByText(publicCourse.title);

    fireEvent.click(screen.getByRole("button", { name: `${region} 바로 선택` }));

    await waitFor(() => {
      expect(mockedFetchRecommendedSpots).toHaveBeenLastCalledWith({ region: "51", sigungu, size: 20 });
      expect(mockedFetch5DayWeather).toHaveBeenLastCalledWith(region);
    });
    expect(screen.getByRole("button", { name: `${region} 바로 선택` })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "강원도 전체 둘러보기" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: `${region} 주간 날씨` })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `${region}의 인기 장소` })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockedFetchPublicCourses).toHaveBeenCalledExactlyOnceWith({ sort: "random", size: 20 });
    expect(mockedFetchLikedCourses).toHaveBeenCalledTimes(1);
  });

  test("지역 선택 후 전체를 누르면 시군 필터와 날씨 지역을 초기화하고 코스는 유지한다", async () => {
    renderMainPage();
    await screen.findByText(publicCourse.title);
    fireEvent.click(screen.getByRole("button", { name: "강릉 바로 선택" }));
    await waitFor(() => expect(mockedFetch5DayWeather).toHaveBeenLastCalledWith("강릉"));

    fireEvent.click(screen.getByRole("button", { name: "강원도 전체 둘러보기" }));

    await waitFor(() => {
      expect(mockedFetchRecommendedSpots).toHaveBeenLastCalledWith({ region: "51", sigungu: undefined, size: 20 });
      expect(mockedFetch5DayWeather).toHaveBeenLastCalledWith(null);
    });
    expect(mockedFetchRecommendedSpots).toHaveBeenCalledTimes(3);
    expect(mockedFetch5DayWeather).toHaveBeenCalledTimes(3);
    expect(screen.getByRole("button", { name: "강원도 전체 둘러보기" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "강릉 바로 선택" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "여행 지역 선택: 강원도 / 지역 선택" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "강원도 주간 날씨" })).toBeInTheDocument();
    expect(mockedFetchPublicCourses).toHaveBeenCalledExactlyOnceWith({ sort: "random", size: 20 });
    expect(mockedFetchLikedCourses).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "인기 장소 더보기" }));
    expect(mockedNavigate).toHaveBeenCalledExactlyOnceWith("/spots/popular");
  });
});
