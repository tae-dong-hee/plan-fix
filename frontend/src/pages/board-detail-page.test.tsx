import { StrictMode } from "react";
import type { MockedFunction } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import BoardDetailPage from "@/pages/board-detail-page";
import { createBoardComment, deleteBoardComment, fetchBoardComments, fetchBoardDetail, likeBoard, unlikeBoard, updateBoardComment, type BoardComment, type BoardDetail, type BoardLikeState } from "@/services/board";
import { fetchCourse } from "@/services/course";
import { fetchMyProfile } from "@/services/user";

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
vi.mock("@/services/user", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/user")>(),
  fetchMyProfile: vi.fn(),
}));

const mockedFetchBoardDetail = fetchBoardDetail as MockedFunction<typeof fetchBoardDetail>;
const mockedFetchCourse = fetchCourse as MockedFunction<typeof fetchCourse>;

function renderAt(boardId: string, { strict = false }: { strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter
      initialEntries={[`/boards/${boardId}`]}
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

function commentFixture(overrides: Partial<BoardComment> = {}): BoardComment {
  return {
    commentId: 1,
    userId: 10,
    boardId: 1,
    parentCommentId: null,
    content: "부모 댓글",
    status: "ACTIVE",
    createdAt: "2026-09-01T11:00:00Z",
    updatedAt: "2026-09-01T11:00:00Z",
    authorName: "작성자",
    ...overrides,
  };
}

function confirmCommentDeletion(content: string) {
  const commentCard = screen.getByText(content).parentElement!;
  fireEvent.click(within(commentCard).getByRole("button", { name: "삭제" }));
  const confirmation = within(commentCard).getByText("댓글을 삭제할까요?").parentElement!;
  fireEvent.click(within(confirmation).getByRole("button", { name: "삭제" }));
}

describe("BoardDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchBoardComments).mockResolvedValue([]);
    vi.mocked(deleteBoardComment).mockResolvedValue(undefined);
    vi.mocked(fetchMyProfile).mockResolvedValue({
      userId: 10,
      username: "작성자",
      name: null,
      email: null,
      profileImageUrl: null,
      defaultAvatarColor: "violet",
      role: "USER",
      status: "ACTIVE",
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-01T10:00:00Z",
    });
  });

  test("내 프로필 조회가 실패해도 댓글과 중첩 대댓글에 각 작성자의 사진과 기본 이미지를 표시한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture());
    vi.mocked(fetchMyProfile).mockRejectedValue(new Error("로그인이 필요합니다."));
    vi.mocked(fetchBoardComments).mockResolvedValue([
      commentFixture({ authorProfileImageUrl: "/api/v1/users/10/profile-image?v=1" }),
      commentFixture({ commentId: 2, userId: 20, parentCommentId: 1, content: "사진 있는 대댓글", authorProfileImageUrl: "/api/v1/users/20/profile-image?v=2" }),
      commentFixture({ commentId: 3, userId: 30, parentCommentId: 2, content: "기본 이미지 대댓글", authorDefaultAvatarColor: "green" }),
    ]);

    renderAt("1");

    const parentCard = (await screen.findByText("부모 댓글")).parentElement!;
    const replyCard = screen.getByText("사진 있는 대댓글").parentElement!;
    const nestedCard = screen.getByText("기본 이미지 대댓글").parentElement!;
    expect(within(parentCard).getByRole("img", { name: "프로필 사진" })).toHaveAttribute("src", "/api/v1/users/10/profile-image?v=1");
    expect(within(replyCard).getByRole("img", { name: "프로필 사진" })).toHaveAttribute("src", "/api/v1/users/20/profile-image?v=2");
    expect(within(nestedCard).getByRole("img", { name: "기본 프로필 이미지" })).toBeInTheDocument();

    fireEvent.error(within(replyCard).getByRole("img", { name: "프로필 사진" }));
    expect(within(replyCard).getByRole("img", { name: "기본 프로필 이미지" })).toBeInTheDocument();
    expect(within(parentCard).getByRole("img", { name: "프로필 사진" })).toBeInTheDocument();
  });

  test("댓글을 등록하면 응답의 작성자 사진을 즉시 표시한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture());
    vi.mocked(createBoardComment).mockResolvedValue(commentFixture({
      content: "새 댓글",
      authorProfileImageUrl: "/api/v1/users/10/profile-image?v=new",
    }));

    renderAt("1");

    fireEvent.change(await screen.findByPlaceholderText("댓글을 남겨보세요"), { target: { value: "새 댓글" } });
    fireEvent.click(within(screen.getByRole("region", { name: "댓글" })).getByRole("button", { name: "등록" }));

    const card = (await screen.findByText("새 댓글")).parentElement!;
    expect(within(card).getByRole("img", { name: "프로필 사진" })).toHaveAttribute("src", "/api/v1/users/10/profile-image?v=new");
  });

  test("삭제된 부모가 목록에 없어도 대댓글과 자손을 기존 스레드와 함께 한 번씩 표시한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ commentCount: 4 }));
    const comments = [
      commentFixture({ commentId: 2, parentCommentId: 1, content: "남아 있는 대댓글" }),
      commentFixture({ commentId: 3, parentCommentId: 2, content: "남아 있는 손자 댓글" }),
      commentFixture({ commentId: 4, content: "다른 부모 댓글" }),
      commentFixture({ commentId: 5, parentCommentId: 4, content: "다른 대댓글" }),
    ];
    vi.mocked(fetchBoardComments).mockResolvedValue(comments);

    renderAt("1");

    const section = await screen.findByRole("region", { name: "댓글" });
    for (const comment of comments) {
      expect(within(section).getAllByText(comment.content)).toHaveLength(1);
    }
    expect(within(section).getByRole("heading", { name: "댓글 (4)" })).toBeInTheDocument();
  });

  test("부모 댓글을 삭제해도 대댓글과 손자 댓글이 남고 댓글 수는 하나만 감소한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ commentCount: 3 }));
    vi.mocked(fetchBoardComments).mockResolvedValue([
      commentFixture(),
      commentFixture({ commentId: 2, parentCommentId: 1, content: "남아 있는 대댓글" }),
      commentFixture({ commentId: 3, parentCommentId: 2, content: "남아 있는 손자 댓글" }),
    ]);

    renderAt("1");
    await screen.findByText("남아 있는 손자 댓글");
    confirmCommentDeletion("부모 댓글");

    await waitFor(() => expect(screen.queryByText("부모 댓글")).not.toBeInTheDocument());
    expect(deleteBoardComment).toHaveBeenCalledWith("1", 1);
    expect(screen.getByText("남아 있는 대댓글")).toBeInTheDocument();
    expect(screen.getByText("남아 있는 손자 댓글")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "댓글 (2)" })).toBeInTheDocument();
    expect(screen.getByText("댓글 2")).toBeInTheDocument();
  });

  test("중간 대댓글을 삭제해도 부모 댓글과 남은 자손을 한 번씩 표시한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ commentCount: 4 }));
    vi.mocked(fetchBoardComments).mockResolvedValue([
      commentFixture(),
      commentFixture({ commentId: 2, parentCommentId: 1, content: "삭제할 중간 대댓글" }),
      commentFixture({ commentId: 3, parentCommentId: 2, content: "남아 있는 손자 댓글" }),
      commentFixture({ commentId: 4, parentCommentId: 3, content: "더 깊은 대댓글" }),
    ]);

    renderAt("1");
    await screen.findByText("더 깊은 대댓글");
    confirmCommentDeletion("삭제할 중간 대댓글");

    await waitFor(() => expect(screen.queryByText("삭제할 중간 대댓글")).not.toBeInTheDocument());
    expect(deleteBoardComment).toHaveBeenCalledWith("1", 2);
    for (const content of ["부모 댓글", "남아 있는 손자 댓글", "더 깊은 대댓글"]) {
      expect(screen.getAllByText(content)).toHaveLength(1);
    }
    expect(screen.getByRole("heading", { name: "댓글 (3)" })).toBeInTheDocument();
  });

  test("부모 댓글 삭제가 실패하면 댓글과 대댓글 및 댓글 수를 유지한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ commentCount: 2 }));
    vi.mocked(fetchBoardComments).mockResolvedValue([
      commentFixture(),
      commentFixture({ commentId: 2, parentCommentId: 1, content: "남아 있는 대댓글" }),
    ]);
    vi.mocked(deleteBoardComment).mockRejectedValue(new Error("댓글을 삭제하지 못했습니다."));

    renderAt("1");
    await screen.findByText("남아 있는 대댓글");
    confirmCommentDeletion("부모 댓글");

    expect(await screen.findByRole("alert")).toHaveTextContent("댓글을 삭제하지 못했습니다.");
    expect(screen.getByText("부모 댓글")).toBeInTheDocument();
    expect(screen.getByText("남아 있는 대댓글")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "댓글 (2)" })).toBeInTheDocument();
    expect(screen.getByText("댓글 2")).toBeInTheDocument();
  });

  test("부모가 없는 대댓글도 수정, 답글 작성, 삭제할 수 있다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ commentCount: 1 }));
    const orphan = commentFixture({ commentId: 2, parentCommentId: 1, content: "남아 있는 대댓글" });
    vi.mocked(fetchBoardComments).mockResolvedValue([orphan]);
    vi.mocked(updateBoardComment).mockResolvedValue({ ...orphan, content: "수정한 대댓글" });
    vi.mocked(createBoardComment).mockResolvedValue(
      commentFixture({ commentId: 3, parentCommentId: 2, content: "새로 작성한 답글" }),
    );

    renderAt("1");
    const commentCard = (await screen.findByText(orphan.content)).parentElement!;
    fireEvent.click(within(commentCard).getByRole("button", { name: "수정" }));
    fireEvent.change(within(commentCard).getByRole("textbox"), { target: { value: "수정한 대댓글" } });
    fireEvent.click(within(commentCard).getByRole("button", { name: "저장" }));

    const updatedCard = (await screen.findByText("수정한 대댓글")).parentElement!;
    expect(updateBoardComment).toHaveBeenCalledWith("1", 2, "수정한 대댓글");
    fireEvent.click(within(updatedCard).getByRole("button", { name: "대댓글" }));
    fireEvent.change(within(updatedCard).getByPlaceholderText("대댓글을 남겨보세요"), {
      target: { value: "새로 작성한 답글" },
    });
    fireEvent.click(within(updatedCard).getByRole("button", { name: "등록" }));

    await screen.findByText("새로 작성한 답글");
    expect(createBoardComment).toHaveBeenCalledWith("1", "새로 작성한 답글", 2);
    expect(screen.getByRole("heading", { name: "댓글 (2)" })).toBeInTheDocument();
    confirmCommentDeletion("수정한 대댓글");

    await waitFor(() => expect(screen.queryByText("수정한 대댓글")).not.toBeInTheDocument());
    expect(deleteBoardComment).toHaveBeenCalledWith("1", 2);
    expect(screen.getByText("새로 작성한 답글")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "댓글 (1)" })).toBeInTheDocument();
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
    expect(screen.getByText("여행 후기")).toBeInTheDocument();
    expect(screen.getByText("2026.09.01")).toBeInTheDocument();
    expect(screen.getByText("조회 152")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "강릉 1박 2일 힐링 코스 좋아요" })).toHaveTextContent("좋아요23");
    expect(screen.getByText("댓글 7")).toBeInTheDocument();
    expect(screen.getByText("강릉에서 보낸 특별한 주말 이야기입니다.")).toBeInTheDocument();

    const heroImg = screen.getByAltText("강릉 1박 2일 힐링 코스");
    expect(heroImg).toHaveAttribute("src", "https://example.com/thumb.jpg");
  });

  test("같은 좋아요 버튼으로 저장하고 다시 눌러 취소하며 서버의 좋아요 수를 표시한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ isLiked: false }));
    vi.mocked(likeBoard).mockResolvedValue({ liked: true, likeCount: 25 });
    vi.mocked(unlikeBoard).mockResolvedValue({ liked: false, likeCount: 24 });

    renderAt("1");

    const likeButton = await screen.findByRole("button", { name: "강릉 1박 2일 힐링 코스 좋아요" });
    expect(likeButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(likeButton);

    await waitFor(() => expect(likeButton).toBeEnabled());
    expect(likeBoard).toHaveBeenCalledWith(1);
    expect(likeButton).toHaveAttribute("aria-pressed", "true");
    expect(likeButton).toHaveAccessibleName("강릉 1박 2일 힐링 코스 좋아요");
    expect(likeButton).toHaveTextContent("좋아요25");
    expect(likeButton).not.toHaveTextContent("취소");
    expect(screen.getByRole("link", { name: "위시리스트 · 여행 후기" })).toHaveAttribute("href", "/wishlist?tab=boards");

    fireEvent.click(likeButton);

    await waitFor(() => expect(likeButton).toHaveAttribute("aria-pressed", "false"));
    expect(unlikeBoard).toHaveBeenCalledWith(1);
    expect(likeButton).toHaveAccessibleName("강릉 1박 2일 힐링 코스 좋아요");
    expect(likeButton).toHaveTextContent("좋아요24");
  });

  test("이미 좋아요한 후기는 선택 상태로 표시하고 처리 중 중복 요청을 막는다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ isLiked: true }));
    let finish!: (value: BoardLikeState) => void;
    vi.mocked(unlikeBoard).mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    renderAt("1");

    const likeButton = await screen.findByRole("button", { name: "강릉 1박 2일 힐링 코스 좋아요" });
    expect(likeButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(likeButton);
    fireEvent.click(likeButton);
    expect(likeButton).toBeDisabled();
    expect(unlikeBoard).toHaveBeenCalledTimes(1);

    finish({ liked: false, likeCount: 22 });
    await waitFor(() => expect(likeButton).toBeEnabled());
    expect(likeButton).toHaveTextContent("좋아요22");
  });

  test("좋아요 실패 시 좋아요만 되돌리고 요청 중 등록한 댓글과 댓글 수를 유지한다", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture({ isLiked: false, commentCount: 0 }));
    let fail!: (reason: Error) => void;
    vi.mocked(likeBoard).mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    vi.mocked(createBoardComment).mockResolvedValue(commentFixture({ content: "새 댓글" }));

    renderAt("1");

    const likeButton = await screen.findByRole("button", { name: "강릉 1박 2일 힐링 코스 좋아요" });
    fireEvent.click(likeButton);
    fireEvent.change(screen.getByPlaceholderText("댓글을 남겨보세요"), { target: { value: "새 댓글" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByText("새 댓글");
    fail(new Error("좋아요 처리에 실패했습니다."));

    expect(await screen.findByRole("alert")).toHaveTextContent("좋아요 처리에 실패했습니다.");
    expect(likeButton).toHaveAttribute("aria-pressed", "false");
    expect(likeButton).toHaveTextContent("좋아요23");
    expect(likeButton).toBeEnabled();
    expect(screen.getByText("댓글 1")).toBeInTheDocument();
    expect(screen.getByText("새 댓글")).toBeInTheDocument();
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

  test("clicking back button in header navigates to /main", async () => {
    mockedFetchBoardDetail.mockResolvedValue(boardFixture());

    renderAt("1");
    await screen.findByRole("heading", { name: "강릉 1박 2일 힐링 코스" });

    const backButton = screen.getByRole("button", { name: "뒤로 가기" });
    fireEvent.click(backButton);

    expect(mockedNavigate).toHaveBeenCalledWith("/main");
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
