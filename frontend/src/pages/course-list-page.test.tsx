import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CourseListPage from "./course-list-page";
import * as courseService from "@/services/course";
import * as sharingService from "@/services/course-sharing";

vi.mock("@/services/course");
vi.mock("@/services/course-sharing");

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCourses: courseService.CourseResponse[] = [
  {
    courseId: 1,
    userId: 1,
    title: "속초 1박 2일 맛집 코스",
    description: "속초 중앙시장과 아바이마을",
    thumbnail: null,
    visibility: "PUBLIC",
    status: "ACTIVE",
    viewCount: 20,
    likeCount: 7,
    startDate: "2026-09-15",
    endDate: "2026-09-16",
    days: [
      { dayNumber: 1, spots: [] },
      { dayNumber: 2, spots: [] },
    ],
    createdAt: "2026-09-02T10:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
  },
];

describe("CourseListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sharingService.fetchCourseSharingStatus).mockResolvedValue({ enabled: false });
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <CourseListPage />
      </MemoryRouter>
    );
  };

  it("코스 목록이 비어 있으면 첫 여행 코스 만들기 CTA를 렌더링한다", async () => {
    (courseService.fetchMyCourses as Mock).mockResolvedValue([]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("생성한 여행 코스가 없습니다.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /첫 여행 코스 만들기/i })).toBeInTheDocument();
    });
  });

  it("코스 목록이 있으면 코스 카드를 렌더링한다", async () => {
    (courseService.fetchMyCourses as Mock).mockResolvedValue(mockCourses);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("속초 1박 2일 맛집 코스")).toBeInTheDocument();
      expect(screen.getByText("속초 중앙시장과 아바이마을")).toBeInTheDocument();
      expect(screen.getByText("2일 일정")).toBeInTheDocument();
    });
  });

  it("코스 카드에서 수정 버튼을 누르면 편집 페이지로 이동한다", async () => {
    (courseService.fetchMyCourses as Mock).mockResolvedValue(mockCourses);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "코스 수정" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "코스 수정" }));

    expect(mockNavigate).toHaveBeenCalledWith("/courses/1/edit");
  });

  it("코스 카드에서 삭제 버튼을 누르면 확인 후 deleteCourse를 호출하고 목록에서 제거한다", async () => {
    (courseService.fetchMyCourses as Mock).mockResolvedValue(mockCourses);
    (courseService.deleteCourse as Mock).mockResolvedValue({
      ...mockCourses[0],
      status: "DELETED",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "코스 삭제" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "코스 삭제" }));

    expect(confirmSpy).toHaveBeenCalledWith("정말 이 코스를 삭제하시겠습니까?");
    await waitFor(() => {
      expect(courseService.deleteCourse).toHaveBeenCalledWith(1);
      expect(screen.queryByText("속초 1박 2일 맛집 코스")).not.toBeInTheDocument();
    });
  });
  it("초대 API가 없어도 목록 탭과 초대 화면 링크를 표시한다", async () => {
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue(mockCourses);
    renderComponent();
    await screen.findByRole("heading", { name: mockCourses[0].title });
    fireEvent.click(screen.getByRole("button", { name: "초대받은 코스 0" }));
    expect(screen.getByRole("heading", { name: "아직 초대받은 코스가 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "초대 화면 보기" })).toHaveAttribute("href", "/invite?preview=1");
    expect(screen.queryByRole("button", { name: "코스 삭제" })).not.toBeInTheDocument();
    expect(sharingService.fetchCourseSharingStatus).not.toHaveBeenCalled();
    expect(sharingService.fetchSharedCourses).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "내가 만든 코스 1" }));
    expect(screen.getByRole("heading", { name: mockCourses[0].title })).toBeInTheDocument();
  });

});
