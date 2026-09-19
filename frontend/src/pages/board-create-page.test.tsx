import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BoardCreatePage from "@/pages/board-create-page";
import * as boardService from "@/services/board";
import * as courseService from "@/services/course";
import * as draftService from "@/services/board-ai";
import * as imageService from "@/services/image";

vi.mock("@/services/board-ai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/board-ai")>(),
  generateBoardDraft: vi.fn(),
}));
vi.mock("@/services/image", () => ({ uploadImageFile: vi.fn() }));

vi.mock("@/services/board", () => ({
  createBoard: vi.fn(),
}));

vi.mock("@/services/course", () => ({
  fetchMyCourses: vi.fn(),
}));

const mockCourse: courseService.CourseResponse = {
  courseId: 101, userId: 1, title: "제주 동쪽 감성 코스", description: "동쪽 힐링 코스",
  thumbnail: "https://example.com/jeju.jpg", visibility: "PRIVATE", status: "ACTIVE",
  viewCount: 0, likeCount: 0, startDate: null, endDate: null,
  days: [{ dayNumber: 1, spots: [
    { spotId: 10, title: "성산일출봉", address: "제주 서귀포시 성산읍", sequence: 1, category: "여행지",
      memo: null, region: "제주", sigungu: "서귀포시", thumbnail: null, latitude: null, longitude: null },
    { spotId: 20, title: "섭지코지", address: "제주 서귀포시 성산읍", sequence: 2, category: "여행지",
      memo: null, region: "제주", sigungu: "서귀포시", thumbnail: null, latitude: null, longitude: null },
  ] }],
  createdAt: "2026-09-19T00:00:00Z", updatedAt: "2026-09-19T00:00:00Z",
};

describe("BoardCreatePage (블로그형 여행 후기 에디터)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([]);
    URL.createObjectURL = vi.fn(() => "blob:travel-photo");
    URL.revokeObjectURL = vi.fn();
  });

  it("초기 화면이 정상 렌더링된다", () => {
    render(
      <MemoryRouter initialEntries={["/boards/create"]}>
        <Routes>
          <Route path="/boards/create" element={<BoardCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("여행 후기 작성")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/여행 후기 제목을 입력하세요/i)).toBeInTheDocument();
    expect(screen.getByText(/대표 커버 사진 추가/i)).toBeInTheDocument();
    expect(screen.getByText("내 여행 코스 연결")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발행하기" })).toBeInTheDocument();
    expect(screen.getByText("사진 추가")).toBeInTheDocument();
    expect(screen.getByText("장소 카드 첨부")).toBeInTheDocument();
  });

  it("코스 목록을 불러와 셀렉트 박스에 렌더링한다", async () => {
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([mockCourse]);

    render(
      <MemoryRouter initialEntries={["/boards/create"]}>
        <Routes>
          <Route path="/boards/create" element={<BoardCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("제주 동쪽 감성 코스 (1일 코스)")).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "101" } });

    expect(screen.getByText("+ 성산일출봉")).toBeInTheDocument();
  });

  it("코스만 연결하면 방문을 가정하지 않고 직접 고른 장소만 AI에 전달한다", async () => {
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([mockCourse]);
    vi.mocked(draftService.generateBoardDraft).mockResolvedValue({ content: "제주에서 찍은 여행 사진이에요." });
    render(<MemoryRouter><BoardCreatePage /></MemoryRouter>);
    await screen.findByRole("option", { name: "제주 동쪽 감성 코스 (1일 코스)" });
    fireEvent.change(screen.getByRole("combobox", { name: "내 여행 코스 연결" }), { target: { value: "101" } });
    const places = within(screen.getByRole("group", { name: "다녀온 장소 선택" }));
    places.getAllByRole("button").forEach((button) => expect(button).toHaveAttribute("aria-pressed", "false"));
    const file = new File(["trip"], "jeju.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("여행 후기 제목"), { target: { value: "제주 여행" } });
    fireEvent.change(screen.getByLabelText("AI 여행 사진 선택"), { target: { files: [file] } });

    await screen.findByText("제주에서 찍은 여행 사진이에요.");
    expect(draftService.generateBoardDraft).toHaveBeenNthCalledWith(1,
      { files: [file], title: "제주 여행", note: "", courseId: 101, visitedSpotIds: [] }, expect.any(AbortSignal));
    fireEvent.click(places.getByRole("button", { name: "성산일출봉" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 써주기" }));
    await screen.findByText("새로 쓴 AI 초안");
    expect(draftService.generateBoardDraft).toHaveBeenNthCalledWith(2,
      { files: [file], title: "제주 여행", note: "", courseId: 101, visitedSpotIds: [10] }, expect.any(AbortSignal));
  });

  it("AI가 작성하는 동안 코스와 방문 장소 선택을 잠그고 완료하면 다시 허용한다", async () => {
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([mockCourse]);
    let resolveDraft!: (value: { content: string }) => void;
    vi.mocked(draftService.generateBoardDraft).mockReturnValueOnce(new Promise((resolve) => { resolveDraft = resolve; }));
    render(<MemoryRouter><BoardCreatePage /></MemoryRouter>);
    await screen.findByRole("option", { name: "제주 동쪽 감성 코스 (1일 코스)" });
    const courseSelect = screen.getByRole("combobox", { name: "내 여행 코스 연결" });
    fireEvent.change(courseSelect, { target: { value: "101" } });
    const place = within(screen.getByRole("group", { name: "다녀온 장소 선택" })).getByRole("button", { name: "성산일출봉" });
    fireEvent.click(place);
    fireEvent.change(screen.getByLabelText("AI 여행 사진 선택"), { target: { files: [new File(["trip"], "jeju.jpg", { type: "image/jpeg" })] } });

    expect(courseSelect).toBeDisabled();
    expect(place).toBeDisabled();
    expect(screen.getByRole("button", { name: "발행하기" })).toBeDisabled();
    await act(async () => resolveDraft({ content: "성산일출봉에 다녀왔어요." }));
    expect(courseSelect).toBeEnabled();
    expect(place).toBeEnabled();
    expect(screen.getByRole("button", { name: "발행하기" })).toBeEnabled();
  });

  it("제목이 비어있으면 경고창이 뜨고 발행되지 않는다", async () => {
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={["/boards/create"]}>
        <Routes>
          <Route path="/boards/create" element={<BoardCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    const submitBtn = screen.getByRole("button", { name: "발행하기" });
    fireEvent.click(submitBtn);

    expect(alertMock).toHaveBeenCalledWith("여행 후기 제목을 입력해 주세요.");
    expect(boardService.createBoard).not.toHaveBeenCalled();

    alertMock.mockRestore();
  });

  it("사진으로 만든 본문을 편집기에 채우고 사진과 함께 발행한다", async () => {
    vi.mocked(draftService.generateBoardDraft).mockResolvedValue({ content: "푸른 바다를 사진에 담았어요.\n\n해변의 풍경을 오래 기억하고 싶어요." });
    vi.mocked(imageService.uploadImageFile)
      .mockResolvedValueOnce({ imageUrl: "https://example.com/beach.jpg" })
      .mockResolvedValueOnce({ imageUrl: "https://example.com/sea.jpg" });
    vi.mocked(boardService.createBoard).mockResolvedValue({ boardId: 200 } as boardService.BoardDetail);
    render(<MemoryRouter initialEntries={["/boards/create"]}><Routes>
      <Route path="/boards/create" element={<BoardCreatePage />} />
      <Route path="/boards/200" element={<p>발행한 이야기</p>} />
    </Routes></MemoryRouter>);
    const files = [new File(["beach"], "beach.jpg", { type: "image/jpeg" }), new File(["sea"], "sea.jpg", { type: "image/jpeg" })];
    fireEvent.change(screen.getByLabelText("여행 후기 제목"), { target: { value: "사진으로 남긴 여행" } });
    fireEvent.change(screen.getByLabelText("AI 여행 사진 선택"), { target: { files } });
    expect(await screen.findByText("푸른 바다를 사진에 담았어요.")).toBeInTheDocument();
    expect(imageService.uploadImageFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "직접 작성" }));
    expect(screen.getByText("푸른 바다를 사진에 담았어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "발행하기" }));
    expect(await screen.findByText("발행한 이야기")).toBeInTheDocument();
    expect(boardService.createBoard).toHaveBeenCalledWith(expect.objectContaining({
      title: "사진으로 남긴 여행",
      content: "<p>푸른 바다를 사진에 담았어요.</p><p>해변의 풍경을 오래 기억하고 싶어요.</p>",
      thumbnail: "https://example.com/beach.jpg",
      images: [{ imageUrl: "https://example.com/beach.jpg" }, { imageUrl: "https://example.com/sea.jpg" }],
    }));
  });

  it("사진 저장 실패 시 발행하지 않고 재시도할 때 이미 저장한 사진을 재사용한다", async () => {
    const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.mocked(draftService.generateBoardDraft).mockResolvedValue({ content: "바다 풍경을 담은 여행이에요." });
    vi.mocked(imageService.uploadImageFile)
      .mockResolvedValueOnce({ imageUrl: "https://example.com/first.jpg" })
      .mockRejectedValueOnce(new Error("사진 업로드 실패"))
      .mockResolvedValueOnce({ imageUrl: "https://example.com/second.jpg" });
    vi.mocked(boardService.createBoard).mockResolvedValue({ boardId: 201 } as boardService.BoardDetail);
    render(<MemoryRouter><BoardCreatePage /></MemoryRouter>);
    const files = [new File(["first"], "first.jpg", { type: "image/jpeg" }), new File(["second"], "second.jpg", { type: "image/jpeg" })];
    fireEvent.change(screen.getByLabelText("여행 후기 제목"), { target: { value: "바다 여행" } });
    fireEvent.change(screen.getByLabelText("AI 여행 사진 선택"), { target: { files } });
    await screen.findByText("바다 풍경을 담은 여행이에요.");
    fireEvent.click(screen.getByRole("button", { name: "발행하기" }));
    await screen.findByText("사진 업로드 실패");
    expect(boardService.createBoard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "발행하기" }));
    await waitFor(() => expect(boardService.createBoard).toHaveBeenCalledTimes(1));
    expect(imageService.uploadImageFile).toHaveBeenCalledTimes(3);
    expect(imageService.uploadImageFile).toHaveBeenNthCalledWith(1, files[0]);
    expect(imageService.uploadImageFile).toHaveBeenNthCalledWith(3, files[1]);
    alertMock.mockRestore();
  });
});
