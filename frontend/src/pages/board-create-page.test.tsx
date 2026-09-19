import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BoardCreatePage from "@/pages/board-create-page";
import * as boardService from "@/services/board";
import * as courseService from "@/services/course";

vi.mock("@/services/board", () => ({
  createBoard: vi.fn(),
}));

vi.mock("@/services/course", () => ({
  fetchMyCourses: vi.fn(),
}));

describe("BoardCreatePage (블로그형 여행 후기 에디터)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([]);
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

    expect(alertMock).toHaveBeenCalledWith("여행 후기 제목을 입력해 주세요.");
    expect(boardService.createBoard).not.toHaveBeenCalled();

    alertMock.mockRestore();
  });
});
