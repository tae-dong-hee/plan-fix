import { CourseAccessError } from "@/lib/course-errors";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import WishlistPage from "./wishlist-page";
import { unlikeBoard, type BoardDetail, type BoardLikeState } from "@/services/board";
import { unlikeCourse, type CourseResponse } from "@/services/course";
import { unlikeSpot } from "@/services/spots";
import { fetchLikedBoards, fetchLikedCourses, fetchLikedSpots, type WishlistSpot } from "@/services/wishlist";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";
import { useGoogleSpotCover } from "@/hooks/use-google-spot-cover";

vi.mock("@/components/ui/app-nav", () => ({ default: () => null }));
vi.mock("@/services/wishlist");
vi.mock("@/services/board");
vi.mock("@/services/course");
vi.mock("@/services/spots");
vi.mock("@/hooks/use-google-spot-cover");

const spot: WishlistSpot = {
  spotId: 1, title: "경포해변", category: "관광지", region: "강원", sigungu: "강릉",
  address: "강릉시", thumbnail: null, likeCount: 3, isLiked: true,
};
const course: CourseResponse = {
  courseId: 1, userId: 10, title: "강릉 하루 코스", description: null,
  thumbnail: null, visibility: "PUBLIC", status: "ACTIVE", viewCount: 4, likeCount: 2,
  startDate: null, endDate: null, days: [{ dayNumber: 1, spots: [] }],
  createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z",
};
const board: BoardDetail = {
  boardId: 1, userId: 10, courseId: 1, title: "강릉에서 보낸 주말",
  content: "<p>친구와 바다를 보고 왔어요.</p>", thumbnail: null, status: "PUBLISHED",
  viewCount: 6, likeCount: 2, commentCount: 1, images: [], isLiked: true,
  createdAt: "2026-09-01T10:00:00Z", updatedAt: "2026-09-01T10:00:00Z",
};

function HistoryControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output aria-label="현재 주소">{location.pathname}{location.search}</output>
    <button type="button" onClick={() => navigate(-1)}>이전 분류</button>
  </>;
}

function renderPage(path = "/wishlist") {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WishlistPage />
      <HistoryControls />
    </MemoryRouter>,
  );
}

describe("WishlistPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGoogleSpotCover).mockReturnValue({ viewportRef: vi.fn(), photo: null, attribution: undefined, onSourceChange: vi.fn() });
    vi.mocked(fetchLikedSpots).mockResolvedValue([spot]);
    vi.mocked(fetchLikedCourses).mockResolvedValue([course]);
    vi.mocked(fetchLikedBoards).mockResolvedValue([board]);
    vi.mocked(unlikeBoard).mockResolvedValue({ likeCount: 1, liked: false });
  });

  test("Google 대표 사진과 촬영자 링크를 표시하고 사진 실패 후 출처를 제거한다", async () => {
    const googleSpot: WishlistSpot = {
      ...spot, spotId: 728, title: "파인시티호텔", category: "숙박", region: "51", sigungu: "150",
      address: "강원특별자치도 강릉시 옥천로62번길 13 (옥천동)", latitude: 37.7608316, longitude: 128.8991773,
    };
    vi.mocked(fetchLikedSpots).mockResolvedValue([googleSpot]);
    const viewportRef = vi.fn();
    const onSourceChange = vi.fn();
    const photo = {
      url: "https://example.com/google-first.jpg",
      google: {
        authors: [{ displayName: "호텔 촬영자", uri: "https://maps.google.com/contrib/author" }],
        mapsUrl: "https://maps.google.com/place/hotel",
      },
    };
    vi.mocked(useGoogleSpotCover).mockReturnValue({ viewportRef, photo, attribution: photo.google, onSourceChange });
    const { rerender } = renderPage();
    const card = await screen.findByTestId("wishlist-spot-728");
    const image = within(card).getByRole("img");
    expect(image).toHaveAttribute("src", photo.url);
    expect(viewportRef).toHaveBeenCalledWith(card.closest("article"));
    expect(useGoogleSpotCover).toHaveBeenCalledWith(expect.objectContaining({
      spotId: 728, title: "파인시티호텔", latitude: 37.7608316, longitude: 128.8991773,
    }));
    await waitFor(() => expect(onSourceChange).toHaveBeenLastCalledWith(photo.url));
    const author = screen.getByRole("link", { name: "호텔 촬영자" });
    expect(author).toHaveAttribute("href", photo.google.authors[0].uri);
    expect(author.parentElement?.closest("a, button")).toBeNull();
    expect(card).not.toContainElement(author);
    expect(screen.getByRole("button", { name: `${googleSpot.title} 여행지 좋아요 취소` }).closest("a")).toBeNull();

    fireEvent.error(image);
    expect(image).toHaveAttribute("src", getSimilarSpotImage(googleSpot).url);
    await waitFor(() => expect(onSourceChange).toHaveBeenLastCalledWith(getSimilarSpotImage(googleSpot).url));
    vi.mocked(useGoogleSpotCover).mockReturnValue({ viewportRef, photo, attribution: undefined, onSourceChange });
    rerender(<MemoryRouter initialEntries={["/wishlist"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <WishlistPage /><HistoryControls />
    </MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Google Maps" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "호텔 촬영자" })).not.toBeInTheDocument();
    expect(within(card).getByRole("img")).toHaveAttribute("src", getSimilarSpotImage(googleSpot).url);
  });

  test("사진이 없는 위시리스트 장소에도 유형에 맞는 유사 이미지를 보여준다", async () => {
    renderPage();

    const card = await screen.findByTestId("wishlist-spot-1");
    expect(within(card).getByRole("img")).toHaveAttribute("src", getSimilarSpotImage(spot).url);
    expect(within(card).getByRole("img")).toHaveAccessibleName(/경포해변 유사 이미지:/);
    expect(within(card).getByText("유사 이미지")).toBeInTheDocument();
    expect(card).toHaveAttribute("href", "/spots/1");
    const creditLink = screen.getByRole("link", { name: "사진 출처" });
    expect(creditLink).toHaveAttribute("href", "/image-credits#similar-images");
    expect(card).not.toContainElement(creditLink);
  });

  test("기존 사진을 먼저 보여주고 로딩에 실패하면 유사 이미지로 복구한다", async () => {
    vi.mocked(fetchLikedSpots).mockResolvedValue([{ ...spot, thumbnail: "https://example.com/beach.jpg" }]);
    renderPage();

    const card = await screen.findByTestId("wishlist-spot-1");
    const image = within(card).getByRole("img", { name: spot.title });
    expect(image).toHaveAttribute("src", "https://example.com/beach.jpg");
    expect(within(card).queryByText("유사 이미지")).not.toBeInTheDocument();
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", getSimilarSpotImage(spot).url);
    expect(within(card).getByText("유사 이미지")).toBeInTheDocument();
  });

  test("비공개 전환으로 좋아요 취소가 거절되면 오래된 코스를 목록에서 제거한다", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(unlikeCourse).mockRejectedValueOnce(new CourseAccessError());
    renderPage("/wishlist?tab=courses");
    fireEvent.click(await screen.findByRole("button", { name: `${course.title} 여행 코스 좋아요 취소` }));
    await waitFor(() => expect(screen.queryByTestId("wishlist-course-1")).not.toBeInTheDocument());
    expect(alert).toHaveBeenCalledWith("코스가 비공개로 변경되었거나 접근 권한이 없습니다.");
    expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/wishlist?tab=courses");
    alert.mockRestore();
  });

  test("탭 복귀 시 비공개로 전환된 코스를 위시리스트에서 갱신한다", async () => {
    renderPage("/wishlist?tab=courses");
    await screen.findByTestId("wishlist-course-1");
    vi.mocked(fetchLikedCourses).mockResolvedValueOnce([]);
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByTestId("wishlist-course-1")).not.toBeInTheDocument());
  });

  test("같은 ID의 여행지, 코스, 후기도 각각의 분류와 개수로 보여준다", async () => {
    renderPage();

    await screen.findByTestId("wishlist-spot-1");
    const categories = within(screen.getByRole("group", { name: "좋아요 종류" }));
    expect(categories.getByRole("button", { name: "여행지 1개" })).toHaveAttribute("aria-pressed", "true");
    expect(categories.getByRole("button", { name: "여행 코스 1개" })).toHaveAttribute("aria-pressed", "false");
    expect(categories.getByRole("button", { name: "여행 후기 1개" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByTestId("wishlist-course-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wishlist-board-1")).not.toBeInTheDocument();

    fireEvent.click(categories.getByRole("button", { name: "여행 코스 1개" }));
    expect(screen.getByTestId("wishlist-course-1")).toHaveTextContent("여행 코스 · 당일치기 여행");
    expect(screen.queryByTestId("wishlist-spot-1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/wishlist?tab=courses");

    fireEvent.click(categories.getByRole("button", { name: "여행 후기 1개" }));
    expect(screen.getByTestId("wishlist-board-1")).toHaveTextContent("여행 후기");
    expect(screen.getByRole("link", { name: `${board.title} 여행 후기 읽기` })).toHaveAttribute("href", "/boards/1");
    expect(screen.queryByTestId("wishlist-course-1")).not.toBeInTheDocument();
    expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/wishlist?tab=boards");

    fireEvent.click(screen.getByRole("button", { name: "이전 분류" }));
    await screen.findByTestId("wishlist-course-1");
    expect(categories.getByRole("button", { name: "여행 코스 1개" })).toHaveAttribute("aria-pressed", "true");
  });

  test("후기 좋아요를 취소하면 후기 개수만 줄고 다른 좋아요는 유지된다", async () => {
    let finishUnlike!: (state: BoardLikeState) => void;
    vi.mocked(unlikeBoard).mockReturnValue(new Promise<BoardLikeState>((resolve) => { finishUnlike = resolve; }));
    renderPage("/wishlist?tab=boards");

    const unlike = await screen.findByRole("button", { name: `${board.title} 여행 후기 좋아요 취소` });
    expect(unlike.closest("a")).toBeNull();
    fireEvent.click(unlike);
    expect(unlike).toBeDisabled();
    fireEvent.click(unlike);
    expect(unlikeBoard).toHaveBeenCalledTimes(1);
    expect(unlikeBoard).toHaveBeenCalledWith(1);
    expect(screen.getByTestId("wishlist-board-1")).toBeInTheDocument();

    await act(async () => finishUnlike({ likeCount: 1, liked: false }));
    expect(screen.queryByTestId("wishlist-board-1")).not.toBeInTheDocument();
    expect(screen.getByText("좋아요한 여행 후기가 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "여행 후기 0개" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "여행지 1개" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "여행 코스 1개" })).toBeInTheDocument();
    expect(unlikeSpot).not.toHaveBeenCalled();
    expect(unlikeCourse).not.toHaveBeenCalled();
    expect(screen.getByLabelText("현재 주소")).toHaveTextContent("/wishlist?tab=boards");
  });

  test("좋아요 취소가 실패하면 후기와 개수를 유지하고 다시 시도할 수 있다", async () => {
    vi.mocked(unlikeBoard).mockRejectedValueOnce(new Error("Network error"));
    renderPage("/wishlist?tab=boards");

    const unlike = await screen.findByRole("button", { name: `${board.title} 여행 후기 좋아요 취소` });
    fireEvent.click(unlike);
    expect(await screen.findByRole("alert")).toHaveTextContent("여행 후기 좋아요를 취소하지 못했습니다.");
    expect(screen.getByTestId("wishlist-board-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "여행 후기 1개" })).toBeInTheDocument();
    expect(unlike).toBeEnabled();

    fireEvent.click(unlike);
    await waitFor(() => expect(screen.queryByTestId("wishlist-board-1")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("알 수 없는 분류 주소는 여행지 목록을 보여준다", async () => {
    renderPage("/wishlist?tab=unknown");
    await screen.findByTestId("wishlist-spot-1");
    expect(screen.getByRole("button", { name: "여행지 1개" })).toHaveAttribute("aria-pressed", "true");
  });
});
