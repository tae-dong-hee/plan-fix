import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

describe("BoardCreatePage (블로그형 여행기 에디터)", () => {
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

    expect(screen.getByText("여행기 작성")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/여행기 제목을 입력하세요/i)).toBeInTheDocument();
    expect(screen.getByText(/대표 커버 사진 추가/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /내 여행 코스 연결/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "발행하기" })).toBeInTheDocument();
    expect(screen.getByText("사진 추가")).toBeInTheDocument();
    expect(screen.getByText("장소 카드 첨부")).toBeInTheDocument();
  });

  it("내 코스 카드에서 연결한 장소를 에디터에 표시하고 연결을 해제한다", async () => {
    const mockCourses: courseService.CourseResponse[] = [
      {
        courseId: 101,
        userId: 7,
        title: "제주 동쪽 감성 코스",
        description: "동쪽 힐링 코스",
        thumbnail: "https://example.com/jeju.jpg",
        visibility: "PUBLIC",
        status: "ACTIVE",
        viewCount: 0,
        likeCount: 0,
        startDate: "2026-09-12",
        endDate: "2026-09-12",
        days: [
          {
            dayNumber: 1,
            spots: [
              {
                spotId: 10,
                sequence: 0,
                memo: null,
                title: "성산일출봉",
                category: "자연",
                region: "제주",
                sigungu: "서귀포시",
                address: "제주 서귀포시 성산읍",
                thumbnail: null,
                latitude: null,
                longitude: null,
              },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(courseService.fetchMyCourses).mockResolvedValue(mockCourses);

    render(
      <MemoryRouter initialEntries={["/boards/create"]}>
        <Routes>
          <Route path="/boards/create" element={<BoardCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /내 코스 선택하기/ }));
    const courseCard = await screen.findByRole("radio", { name: "제주 동쪽 감성 코스" });
    fireEvent.click(courseCard);
    expect(screen.queryByText("+ 성산일출봉")).not.toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "내 코스 선택하기" });
    fireEvent.click(within(dialog).getByRole("button", { name: "이 코스 연결하기" }));

    expect(screen.getByText("+ 성산일출봉")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("연결된 코스")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "연결 해제" }));
    expect(screen.queryByText("+ 성산일출봉")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /내 코스 선택하기/ })).toBeInTheDocument();
    expect(boardService.createBoard).not.toHaveBeenCalled();
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
});
