import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import BoardListPage from "@/pages/board-list-page";
import {
  fetchBoards,
  likeBoard,
  unlikeBoard,
  type BoardDetail,
  type BoardItem,
} from "@/services/board";
import { fetchLikedBoards } from "@/services/wishlist";

vi.mock("@/components/ui/app-nav", () => ({
  default: () => <nav aria-label="앱 메뉴" />,
}));
vi.mock("@/services/board");
vi.mock("@/services/wishlist");

const mockedFetchBoards = vi.mocked(fetchBoards);
const mockedFetchLikedBoards = vi.mocked(fetchLikedBoards);
const mockedLikeBoard = vi.mocked(likeBoard);
const mockedUnlikeBoard = vi.mocked(unlikeBoard);

const board: BoardItem = {
  boardId: 101,
  title: "강릉 바다에서 보낸 하루",
  thumbnail: "https://example.com/gangneung.jpg",
  userId: 7,
  likeCount: 12,
  viewCount: 150,
  commentCount: 5,
  createdAt: "2026-09-18T10:00:00Z",
};

const likedBoard: BoardDetail = {
  ...board,
  courseId: null,
  content: "강릉 여행 기록",
  status: "ACTIVE",
  images: [],
  isLiked: true,
  updatedAt: board.createdAt,
};

function renderPage(initialUrl = "/boards") {
  return render(
    <MemoryRouter
      initialEntries={[initialUrl]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/boards" element={<BoardListPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BoardListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchBoards.mockResolvedValue({ items: [board], offset: 0, size: 12, totalCount: 1 });
    mockedFetchLikedBoards.mockResolvedValue([]);
    mockedLikeBoard.mockResolvedValue({ liked: true, likeCount: 13 });
    mockedUnlikeBoard.mockResolvedValue({ liked: false, likeCount: 11 });
  });

  test("인기순 후기 전체 목록과 상세·작성 진입점을 표시한다", async () => {
    renderPage();

    expect(mockedFetchBoards).toHaveBeenCalledWith({ sort: "popular", size: 12, offset: 0 });
    expect(await screen.findByRole("heading", { name: board.title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "여행 후기" })).toBeInTheDocument();
    expect(screen.getByText("총 1개의 후기")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: board.title }).closest("a")).toHaveAttribute("href", "/boards/101");
    expect(screen.getByRole("link", { name: "후기 올리기" })).toHaveAttribute("href", "/boards/create");
    expect(screen.getByRole("button", { name: "인기순" })).toHaveAttribute("aria-pressed", "true");
  });

  test("주소의 정렬과 페이지를 읽어 서버 조회 범위에 반영한다", async () => {
    mockedFetchBoards.mockResolvedValue({ items: [board], offset: 12, size: 12, totalCount: 25 });

    renderPage("/boards?sort=latest&page=2");

    expect(mockedFetchBoards).toHaveBeenCalledWith({ sort: "latest", size: 12, offset: 12 });
    expect(await screen.findByRole("heading", { name: board.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최신순" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "이전 페이지" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "다음 페이지" })).toBeEnabled();
  });

  test("정렬을 바꾸면 첫 페이지부터 다시 조회한다", async () => {
    const latestBoard = { ...board, boardId: 202, title: "오늘 등록한 속초 여행" };
    mockedFetchBoards
      .mockResolvedValueOnce({ items: [board], offset: 12, size: 12, totalCount: 25 })
      .mockResolvedValueOnce({ items: [latestBoard], offset: 0, size: 12, totalCount: 1 });
    renderPage("/boards?page=2");
    await screen.findByRole("heading", { name: board.title });

    fireEvent.click(screen.getByRole("button", { name: "최신순" }));

    expect(await screen.findByRole("heading", { name: latestBoard.title })).toBeInTheDocument();
    expect(mockedFetchBoards).toHaveBeenLastCalledWith({ sort: "latest", size: 12, offset: 0 });
  });

  test("목록 조회 실패를 빈 목록과 구분하고 다시 시도한다", async () => {
    mockedFetchBoards
      .mockRejectedValueOnce(new Error("Network failed"))
      .mockResolvedValueOnce({ items: [board], offset: 0, size: 12, totalCount: 1 });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("여행 후기를 불러오지 못했습니다.");
    expect(screen.queryByText("아직 등록된 여행 후기가 없어요.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("heading", { name: board.title })).toBeInTheDocument();
    expect(mockedFetchBoards).toHaveBeenCalledTimes(2);
  });

  test("좋아요한 후기는 선택 상태로 표시하고 취소 결과를 반영한다", async () => {
    mockedFetchLikedBoards.mockResolvedValue([likedBoard]);
    renderPage();

    await screen.findByRole("heading", { name: board.title });
    const likeButton = screen.getByRole("button", { name: `${board.title} 좋아요` });
    await waitFor(() => expect(likeButton).toBeEnabled());
    expect(likeButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(likeButton);
    expect(mockedUnlikeBoard).toHaveBeenCalledWith(board.boardId);
    await act(async () => undefined);
    expect(likeButton).toHaveAttribute("aria-pressed", "false");
    expect(likeButton).toHaveTextContent("11");
  });
});
