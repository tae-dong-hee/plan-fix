import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import BoardCard from "@/components/ui/board-card";
import { likeBoard, unlikeBoard, type BoardItem, type BoardLikeState } from "@/services/board";
import { UnauthorizedError } from "@/services/spots";

vi.mock("@/services/board");

const board: BoardItem = {
  boardId: 7,
  title: "속초 여행 코스",
  thumbnail: null,
  userId: 1,
  likeCount: 4,
  viewCount: 10,
  commentCount: 2,
  createdAt: "2026-09-01T10:00:00Z",
  isLiked: false,
};

function renderCard(overrides: Partial<BoardItem> = {}) {
  return render(
    <MemoryRouter initialEntries={["/main"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/main" element={<BoardCard board={{ ...board, ...overrides }} />} />
        <Route path="/login" element={<p>로그인 화면</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.resetAllMocks());

test("saved likes are displayed and cancel uses the server's returned count", async () => {
  vi.mocked(unlikeBoard).mockResolvedValue({ liked: false, likeCount: 8 });
  renderCard({ isLiked: true });

  const button = screen.getByRole("button", { name: "속초 여행 코스 좋아요 취소" });
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(button.closest("a")).toBeNull();
  fireEvent.click(button);

  await waitFor(() => expect(button).toHaveAttribute("aria-pressed", "false"));
  expect(unlikeBoard).toHaveBeenCalledWith(7);
  expect(likeBoard).not.toHaveBeenCalled();
  expect(screen.getByLabelText("좋아요 8개")).toBeInTheDocument();
  expect(screen.getByText("속초 여행 코스").closest("a")).toHaveAttribute("href", "/boards/7");
});

test("like requests cannot be duplicated while saving and the returned state is applied", async () => {
  let resolve!: (value: BoardLikeState) => void;
  vi.mocked(likeBoard).mockReturnValue(new Promise((done) => { resolve = done; }));
  renderCard();
  const button = screen.getByRole("button", { name: "속초 여행 코스 좋아요" });

  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(likeBoard).toHaveBeenCalledTimes(1);

  await act(async () => resolve({ liked: true, likeCount: 12 }));
  expect(button).toBeEnabled();
  expect(button).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("좋아요 12개")).toBeInTheDocument();
});

test.each([false, true])("failed request preserves liked=%s and count, and supports retry", async (isLiked) => {
  const request = vi.mocked(isLiked ? unlikeBoard : likeBoard);
  request.mockRejectedValueOnce(new Error("Network failure"));
  renderCard({ isLiked });
  const button = screen.getByRole("button", { name: `속초 여행 코스 좋아요${isLiked ? " 취소" : ""}` });
  fireEvent.click(button);

  expect(await screen.findByRole("alert")).toHaveTextContent("좋아요를 저장하지 못했어요.");
  expect(button).toHaveAttribute("aria-pressed", String(isLiked));
  expect(screen.getByLabelText("좋아요 4개")).toBeInTheDocument();
  expect(button).toBeEnabled();

  request.mockResolvedValueOnce({ liked: !isLiked, likeCount: isLiked ? 3 : 5 });
  fireEvent.click(button);
  await waitFor(() => expect(button).toHaveAttribute("aria-pressed", String(!isLiked)));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("an unauthenticated like opens login", async () => {
  vi.mocked(likeBoard).mockRejectedValue(new UnauthorizedError());
  renderCard();
  fireEvent.click(screen.getByRole("button", { name: "속초 여행 코스 좋아요" }));
  expect(await screen.findByText("로그인 화면")).toBeInTheDocument();
});

test("refreshing board data synchronizes the saved like state", () => {
  const { rerender } = render(
    <MemoryRouter><BoardCard board={board} /></MemoryRouter>,
  );
  rerender(
    <MemoryRouter><BoardCard board={{ ...board, isLiked: true, likeCount: 9 }} /></MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: "속초 여행 코스 좋아요 취소" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("좋아요 9개")).toBeInTheDocument();
});
