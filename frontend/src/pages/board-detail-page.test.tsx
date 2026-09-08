import { StrictMode } from "react";
import type { MockedFunction } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import BoardDetailPage from "@/pages/board-detail-page";
import { fetchBoardDetail, type BoardDetail } from "@/services/board";
import { fetchCourse } from "@/services/course";

const mockedNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

vi.mock("@/services/board");
vi.mock("@/services/course");

const mockedFetchBoardDetail = fetchBoardDetail as MockedFunction<typeof fetchBoardDetail>;
const mockedFetchCourse = fetchCourse as MockedFunction<typeof fetchCourse>;

function renderAt(boardId: string, { strict = false, from }: { strict?: boolean; from?: unknown } = {}) {
  const tree = (
    <MemoryRouter
      initialEntries={[{ pathname: `/boards/${boardId}`, state: from === undefined ? null : { from } }]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/boards/:boardId" element={<BoardDetailPage />} />
        <Route path="/main" element={<div>메인 페이지</div>} />
      </Routes>
    </MemoryRouter>
  );

  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function boardFixture(overrides: Partial<BoardDetail> = {}): BoardDetail {
  return {
    boardId: 1,
    courseId: null,
    userId: 10,
    title: "강릉 1박 2일 힐링 코스",
    content: "<p>강릉에서 보낸 특별한 주말 이야기입니다.</p>",
    thumbnail: "https://example.com/thumb.jpg",
    status: "PUBLISHED",
    viewCount: 152,
    likeCount: 23,
    commentCount: 7,
    images: [],
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-09-01T10:00:00Z",
    ...overrides,
  };
}

describe("BoardDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("shows loading status while the detail is being fetched", () => {
    mockedFetchBoardDetail.mockReturnValue(new Promise(() => {}));

    renderAt("1");

    expect(screen.getByRole("status", { name: "게시글을 불러오는 중..." })).toBeInTheDocument();
  });

  test("calls fetchBoardDetail only once per board under StrictMode", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture());

    renderAt("1", { strict: true });

    await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });
    expect(mockedFetchBoardDetail).toHaveBeenCalledTimes(1);
  });

  test("renders board detail once loaded with title, date, stats, and hero image", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture());

    renderAt("1");

    expect(await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" })).toBeInTheDocument();
    expect(screen.getByText("여행 이야기")).toBeInTheDocument();
    expect(screen.getByText("2026.09.01")).toBeInTheDocument();
    expect(screen.getByText("조회 152")).toBeInTheDocument();
    expect(screen.getByText("좋아요 23")).toBeInTheDocument();
    expect(screen.getByText("댓글 7")).toBeInTheDocument();
    expect(screen.getByText("강릉에서 보낸 특별한 주말 이야기입니다.")).toBeInTheDocument();

    const heroImg = screen.getByAltText("강릉 1박 2일 힐링 코스");
    expect(heroImg).toHaveAttribute("src", "https://example.com/thumb.jpg");
  });

  test("renders plain text content preserving line breaks with <br />", async () => {
    mockedFetchBoardDetail.mockResolvedValue(
      boardFixture({
        content: "첫 번째 줄\n두 번째 줄\n세 번째 줄",
      }),
    );

    renderAt("1");

    await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });
    expect(screen.getByText("첫 번째 줄", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("두 번째 줄", { exact: false })).toBeInTheDocument();
  });

  test("renders image gallery when board has images", async () => {
    mockedFetchBoardDetail.mockResolvedValue(
      boardFixture({
        images: [
          { imageUrl: "https://example.com/img1.jpg", altText: "경포해변 풍경", sequence: 1 },
          { imageUrl: "https://example.com/img2.jpg", altText: "카페 라떼", sequence: 2 },
        ],
      }),
    );

    renderAt("1");

    await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });
    expect(screen.getByRole("region", { name: "게시글 사진 갤러리" })).toBeInTheDocument();
    expect(screen.getByText("사진 갤러리")).toBeInTheDocument();
    expect(screen.getByText("(2)")).toBeInTheDocument();
    expect(screen.getByAltText("경포해변 풍경")).toHaveAttribute("src", "https://example.com/img1.jpg");
    expect(screen.getByAltText("카페 라떼")).toHaveAttribute("src", "https://example.com/img2.jpg");
  });

  test("falls back to fallback image when thumbnail and images are missing", async () => {
    mockedFetchBoardDetail.mockResolvedValue(
      boardFixture({
        thumbnail: null,
        images: [],
      }),
    );

    renderAt("1");

    await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });
    const heroImg = screen.getByAltText("강릉 1박 2일 힐링 코스");
    expect(heroImg).toHaveAttribute("src", expect.stringContaining("images.unsplash.com"));
  });

  test("uses first image from images array when thumbnail is null", async () => {
    mockedFetchBoardDetail.mockResolvedValue(
      boardFixture({
        thumbnail: null,
        images: [
          { imageUrl: "https://example.com/first-img.jpg", altText: "첫번째 사진", sequence: 1 },
        ],
      }),
    );

    renderAt("1");

    await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });
    const heroImg = screen.getByAltText("강릉 1박 2일 힐링 코스");
    expect(heroImg).toHaveAttribute("src", "https://example.com/first-img.jpg");
  });

  test("shows not-found message when board does not exist (404)", async () => {
    mockedFetchBoardDetail.mockResolvedValue(null);

    renderAt("999");

    expect(await screen.findByText("게시글을 찾을 수 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "홈으로 돌아가기" })).toBeInTheDocument();
  });

  test("shows not-found message when fetch fails with error", async () => {
    mockedFetchBoardDetail.mockRejectedValue(new Error("Network failure"));

    renderAt("1");

    await waitFor(() => {
      expect(screen.getByText("게시글을 찾을 수 없어요.")).toBeInTheDocument();
    });
  });

  test("a directly opened detail falls back to /main when going back", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture());

    renderAt("1");
    await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });

    const backButton = screen.getByRole("button", { name: "뒤로 가기" });
    fireEvent.click(backButton);

    expect(mockedNavigate).toHaveBeenCalledWith("/main");
  });

  test.each(["/boards?sort=latest&page=3", "/boards", "/main?region=강릉"])(
    "back preserves the source list URL %s",
    async (from) => {
      mockedFetchBoardDetail.mockResolvedValue(boardFixture());
      renderAt("1", { from });
      await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });

      fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

      expect(mockedNavigate).toHaveBeenCalledWith(from);
    },
  );

  test.each(["https://example.com", "//example.com", "/boards/create", "/boards-other", 42])(
    "back ignores a source outside the permitted list pages: %s",
    async (from) => {
      mockedFetchBoardDetail.mockResolvedValue(boardFixture());
      renderAt("1", { from });
      await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });

      fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));

      expect(mockedNavigate).toHaveBeenCalledWith("/main");
    },
  );

  test("a missing story can return to the originating list and page", async () => {
    mockedFetchBoardDetail.mockResolvedValue(null);
    renderAt("999", { from: "/boards?sort=latest&page=3" });

    fireEvent.click(await screen.findByRole("button", { name: "목록으로 돌아가기" }));

    expect(mockedNavigate).toHaveBeenCalledWith("/boards?sort=latest&page=3");
  });

  test("clicking home button in error view navigates to /main", async () => {
    mockedFetchBoardDetail.mockResolvedValue(null);

    renderAt("999");
    const homeButton = await screen.findByRole("button", { name: "홈으로 돌아가기" });

    fireEvent.click(homeButton);

    expect(mockedNavigate).toHaveBeenCalledWith("/main");
  });

  test("연계된 courseId가 있는 게시글인 경우 코스 정보를 로드하여 코스 카드를 렌더링한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ courseId: 77 }));
    mockedFetchCourse.mockResolvedValue({
      courseId: 77,
      userId: 20,
      title: "강릉 바다 드라이브 코스",
      description: "해안도로를 따라 달리는 코스",
      thumbnail: null,
      visibility: "PUBLIC",
      status: "ACTIVE",
      viewCount: 10,
      likeCount: 5,
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      days: [
        {
          dayNumber: 1,
          spots: [
            {
              spotId: 101,
              sequence: 0,
              memo: null,
              title: "경포해변",
              category: "관광지",
              region: "51",
              sigungu: "150",
              address: null,
              thumbnail: null,
              latitude: null,
              longitude: null,
            },
          ],
        },
      ],
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-01T10:00:00Z",
      isOwner: false,
    });

    renderAt("1");

    expect(await screen.findByRole("region", { name: "연계된 여행 코스" })).toBeInTheDocument();
    expect(screen.getByText("강릉 바다 드라이브 코스")).toBeInTheDocument();
    expect(screen.getByText("해안도로를 따라 달리는 코스")).toBeInTheDocument();
    expect(screen.getByText("경포해변")).toBeInTheDocument();
    const courseLink = screen.getByRole("link", { name: /코스 전체 일정 보기/i });
    expect(courseLink).toHaveAttribute("href", "/courses/77");
  });
});
