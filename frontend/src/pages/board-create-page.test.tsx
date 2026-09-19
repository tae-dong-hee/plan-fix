import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("BoardCreatePage (블로그형 여행기 에디터)", () => {
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

    expect(screen.getByText("여행기 작성")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/여행기 제목을 입력하세요/i)).toBeInTheDocument();
    expect(screen.getByText(/대표 커버 사진 추가/i)).toBeInTheDocument();
    expect(screen.getByText("내 여행 코스 연결")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발행하기" })).toBeInTheDocument();
    expect(screen.getByText("사진 추가")).toBeInTheDocument();
    expect(screen.getByText("장소 카드 첨부")).toBeInTheDocument();
  });

  it("코스 목록을 불러와 셀렉트 박스에 렌더링한다", async () => {
    const mockCourses = [
      {
        courseId: 101,
        title: "제주 동쪽 감성 코스",
        description: "동쪽 힐링 코스",
        thumbnail: "https://example.com/jeju.jpg",
        totalDistance: "35km",
        totalDuration: "2일",
        days: [
          {
            dayNumber: 1,
            spots: [
              {
                id: 1,
                spotId: 10,
                title: "성산일출봉",
                address: "제주 서귀포시 성산읍",
                dayNumber: 1,
                orderNumber: 1,
              },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(courseService.fetchMyCourses).mockResolvedValue(mockCourses as unknown as courseService.CourseResponse[]);

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

    expect(alertMock).toHaveBeenCalledWith("여행기 제목을 입력해 주세요.");
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
    fireEvent.change(screen.getByLabelText("여행기 제목"), { target: { value: "사진으로 남긴 여행" } });
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
    fireEvent.change(screen.getByLabelText("여행기 제목"), { target: { value: "바다 여행" } });
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
