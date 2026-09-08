import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import BoardsPage from "@/pages/boards-page";
import { fetchBoards, type BoardItem, type BoardListResult } from "@/services/board";

vi.mock("@/services/board", () => ({ fetchBoards: vi.fn() }));
vi.mock("@/components/ui/app-nav", () => ({ default: () => null }));
vi.mock("@/components/ui/board-card", () => ({
  default: ({ board }: { board: BoardItem }) => <h2>{board.title}</h2>,
}));

const mockedFetchBoards = vi.mocked(fetchBoards);
const board: BoardItem = {
  boardId: 1,
  title: "강릉에서 보낸 하루",
  thumbnail: null,
  userId: 1,
  likeCount: 12,
  viewCount: 30,
  commentCount: 2,
  createdAt: "2026-09-01T12:00:00",
};

function result(overrides: Partial<BoardListResult> = {}): BoardListResult {
  return { items: [board], offset: 0, size: 20, totalCount: 1, ...overrides };
}

function renderPage(initialUrl = "/boards") {
  return render(
    <MemoryRouter
      initialEntries={[initialUrl]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/boards" element={<BoardsPage />} />
        <Route path="/main" element={<h1>메인 화면</h1>} />
        <Route path="/boards/create" element={<h1>이야기 작성</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("BoardsPage", () => {
  beforeEach(() => {
    mockedFetchBoards.mockReset();
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("loads popular stories and provides links to the main and creation pages", async () => {
    mockedFetchBoards.mockResolvedValue(result());
    const view = renderPage();

    expect(mockedFetchBoards).toHaveBeenCalledWith({ sort: "popular", size: 20, offset: 0 });
    expect(await screen.findByRole("heading", { name: board.title })).toBeInTheDocument();
    expect(screen.getByText(/총/)).toHaveTextContent("총 1개의 여행 이야기");
    expect(screen.queryByRole("navigation", { name: "페이지네이션" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "이야기 쓰기" }));
    expect(screen.getByRole("heading", { name: "이야기 작성" })).toBeInTheDocument();
    view.unmount();

    renderPage();
    await screen.findByRole("heading", { name: board.title });
    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(screen.getByRole("heading", { name: "메인 화면" })).toBeInTheDocument();
  });

  test("shows loading until stories arrive", async () => {
    let resolve!: (value: BoardListResult) => void;
    mockedFetchBoards.mockReturnValue(new Promise((complete) => { resolve = complete; }));
    renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("여행 이야기를 불러오는 중...");
    await act(async () => { resolve(result()); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: board.title })).toBeInTheDocument();
  });

  test("distinguishes an empty list from a failed request", async () => {
    mockedFetchBoards.mockResolvedValue(result({ items: [], totalCount: 0 }));
    renderPage();

    expect(await screen.findByText("아직 등록된 여행 이야기가 없어요.")).toBeInTheDocument();
    expect(screen.getByText(/총/)).toHaveTextContent("총 0개의 여행 이야기");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
  });

  test("retries a failed request with the same sort and page", async () => {
    mockedFetchBoards.mockRejectedValueOnce(new Error("Network unavailable"));
    mockedFetchBoards.mockResolvedValueOnce(result({ offset: 20, totalCount: 30 }));
    renderPage("/boards?sort=latest&page=2");

    expect(await screen.findByRole("alert")).toHaveTextContent("여행 이야기를 불러오지 못했어요.");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("heading", { name: board.title })).toBeInTheDocument();
    expect(mockedFetchBoards).toHaveBeenCalledTimes(2);
    expect(mockedFetchBoards).toHaveBeenLastCalledWith({ sort: "latest", size: 20, offset: 20 });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("paginates using 20-item offsets and disables boundary controls", async () => {
    mockedFetchBoards.mockResolvedValue(result({ totalCount: 45 }));
    renderPage();
    await screen.findByRole("heading", { name: board.title });

    expect(screen.getByRole("button", { name: "이전 페이지" })).toBeDisabled();
    vi.mocked(window.scrollTo).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "2" }));
    await waitFor(() => {
      expect(mockedFetchBoards).toHaveBeenLastCalledWith({ sort: "popular", size: 20, offset: 20 });
      expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
    });
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });

    fireEvent.click(screen.getByRole("button", { name: "다음 페이지" }));
    await waitFor(() => {
      expect(mockedFetchBoards).toHaveBeenLastCalledWith({ sort: "popular", size: 20, offset: 40 });
      expect(screen.getByRole("button", { name: "다음 페이지" })).toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "이전 페이지" }));
    await waitFor(() => {
      expect(mockedFetchBoards).toHaveBeenLastCalledWith({ sort: "popular", size: 20, offset: 20 });
      expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
    });
  });

  test("reads query parameters and resets to the first page when changing sort", async () => {
    mockedFetchBoards.mockResolvedValue(result({ totalCount: 60 }));
    renderPage("/boards?sort=latest&page=3");
    await screen.findByRole("heading", { name: board.title });

    expect(mockedFetchBoards).toHaveBeenCalledWith({ sort: "latest", size: 20, offset: 40 });
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    vi.mocked(window.scrollTo).mockClear();
    expect(screen.getByRole("button", { name: "최신순" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "인기순" }));

    await waitFor(() => {
      expect(mockedFetchBoards).toHaveBeenLastCalledWith({ sort: "popular", size: 20, offset: 0 });
      expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
    });
    expect(screen.getByRole("button", { name: "인기순" })).toHaveAttribute("aria-pressed", "true");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  test.each(["-1", "1.5", "invalid"])("falls back to the first page for invalid page %s", async (page) => {
    mockedFetchBoards.mockResolvedValue(result());
    renderPage(`/boards?page=${page}`);

    await screen.findByRole("heading", { name: board.title });
    expect(mockedFetchBoards).toHaveBeenCalledWith({ sort: "popular", size: 20, offset: 0 });
  });

  test("recovers from a page beyond the available results", async () => {
    mockedFetchBoards.mockResolvedValueOnce(result({ items: [], offset: 180, totalCount: 25 }));
    mockedFetchBoards.mockResolvedValueOnce(result({ offset: 20, totalCount: 25 }));
    renderPage("/boards?page=10");

    await screen.findByRole("heading", { name: board.title });
    expect(mockedFetchBoards).toHaveBeenLastCalledWith({ sort: "popular", size: 20, offset: 20 });
    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
  });

  test("ignores an older response after the sort changes", async () => {
    let resolvePopular!: (value: BoardListResult) => void;
    mockedFetchBoards.mockReturnValueOnce(new Promise((complete) => { resolvePopular = complete; }));
    mockedFetchBoards.mockResolvedValueOnce(result({ items: [{ ...board, boardId: 2, title: "새 여행 이야기" }] }));
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "최신순" }));
    await screen.findByRole("heading", { name: "새 여행 이야기" });
    await act(async () => { resolvePopular(result()); });

    expect(screen.getByRole("heading", { name: "새 여행 이야기" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: board.title })).not.toBeInTheDocument();
  });
});
