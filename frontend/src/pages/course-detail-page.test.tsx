import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CourseDetailPage from "./course-detail-page";
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

const mockCourse: courseService.CourseResponse = {
  courseId: 10,
  userId: 1,
  title: "강릉 바다 여행",
  description: "2박 3일 힐링 코스",
  thumbnail: null,
  visibility: "PUBLIC",
  status: "ACTIVE",
  viewCount: 15,
  likeCount: 5,
  startDate: "2026-09-12",
  endDate: "2026-09-13",
  days: [
    {
      dayNumber: 1,
      spots: [
        {
          spotId: 101,
          sequence: 0,
          memo: "오전 10시 도착",
          title: "경포해변",
          category: "관광지",
          region: "51",
          sigungu: "150",
          address: "강원특별자치도 강릉시 안현동",
          thumbnail: null,
          latitude: null,
          longitude: null,
        },
      ],
    },
    {
      dayNumber: 2,
      spots: [],
    },
  ],
  createdAt: "2026-09-02T10:00:00Z",
  updatedAt: "2026-09-02T10:00:00Z",
};

describe("CourseDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sharingService.fetchCourseSharingStatus).mockResolvedValue({ enabled: false });
  });

  const renderComponent = (courseId = "10", courseSaveAction?: "created" | "updated") => {
    return render(
      <MemoryRouter initialEntries={[{ pathname: `/courses/${courseId}`, state: courseSaveAction ? { courseSaveAction } : null }]}>
        <Routes>
          <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  it("코스 정보를 성공적으로 로드하여 Day별 장소를 렌더링한다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue(mockCourse);

    renderComponent();

    expect(screen.getByText(/여행 코스를 불러오는 중입니다/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("강릉 바다 여행")).toBeInTheDocument();
      expect(screen.getByText("2박 3일 힐링 코스")).toBeInTheDocument();
      expect(screen.getByText("경포해변")).toBeInTheDocument();
      expect(screen.getByText("💬 오전 10시 도착")).toBeInTheDocument();
      expect(screen.getByText("아직 계획이 없어요.")).toBeInTheDocument();
    });
    expect(screen.queryByText("여행 코스를 저장했어요")).not.toBeInTheDocument();
    expect(screen.queryByText("여행 코스를 수정했어요")).not.toBeInTheDocument();
  });

  it.each([
    ["created", "여행 코스를 저장했어요"],
    ["updated", "여행 코스를 수정했어요"],
  ] as const)("%s 후 실제 코스를 불러오면 완료 안내와 내 코스 목록 링크를 표시한다", async (action, message) => {
    (courseService.fetchCourse as Mock).mockResolvedValue(mockCourse);
    renderComponent("10", action);
    expect(screen.queryByText(message)).not.toBeInTheDocument();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(courseService.fetchCourse).toHaveBeenCalledWith("10");
    expect(screen.getByRole("link", { name: "내 코스 전체 보기" })).toHaveAttribute("href", "/courses");
    expect(screen.getByRole("heading", { name: "강릉 바다 여행" })).toBeInTheDocument();
    expect(screen.getByText("경포해변")).toBeInTheDocument();
  });

  it.each(["missing", "error"] as const)("저장 후 상세 조회 결과가 %s이면 저장 완료 화면으로 표시하지 않는다", async (result) => {
    if (result === "missing") {
      (courseService.fetchCourse as Mock).mockResolvedValue(null);
    } else {
      (courseService.fetchCourse as Mock).mockRejectedValue(new Error("상세 정보를 불러오지 못했습니다."));
    }
    renderComponent("10", "created");

    await screen.findByText(result === "missing" ? "존재하지 않거나 삭제된 코스입니다." : "상세 정보를 불러오지 못했습니다.");
    expect(screen.queryByText("여행 코스를 저장했어요")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "강릉 바다 여행" })).not.toBeInTheDocument();
  });

  it.each([
    ["https://example.com/course.jpg", "https://example.com/course.jpg"],
    [null, "https://example.com/spot.jpg"],
  ])("코스 대표 사진 %s이 있으면 사용하고 없으면 방문 장소 사진을 사용한다", async (thumbnail, expected) => {
    (courseService.fetchCourse as Mock).mockResolvedValue({
      ...mockCourse,
      thumbnail,
      days: [{
        ...mockCourse.days[0],
        spots: [{ ...mockCourse.days[0].spots[0], thumbnail: "https://example.com/spot.jpg" }],
      }, mockCourse.days[1]],
    });
    renderComponent();

    const cover = await screen.findByRole("img", { name: "강릉 바다 여행 대표 사진" });
    expect(cover).toHaveAttribute("src", expected);
    fireEvent.error(cover);
    expect(screen.queryByRole("img", { name: "강릉 바다 여행 대표 사진" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "강릉 바다 여행" })).toBeInTheDocument();
    expect(screen.getByTestId("day-detail-1")).toBeInTheDocument();
  });

  it("수정 링크와 삭제 버튼이 렌더링되고 삭제 시 확인 후 deleteCourse를 호출한다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue(mockCourse);
    (courseService.deleteCourse as Mock).mockResolvedValue({
      ...mockCourse,
      status: "DELETED",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /코스 수정/i })).toHaveAttribute(
        "href",
        "/courses/10/edit"
      );
      expect(screen.getByRole("button", { name: /코스 삭제/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /코스 삭제/i }));

    expect(confirmSpy).toHaveBeenCalledWith("정말 이 여행 코스를 삭제하시겠습니까?");
    await waitFor(() => {
      expect(courseService.deleteCourse).toHaveBeenCalledWith("10");
      expect(mockNavigate).toHaveBeenCalledWith("/courses", { replace: true });
    });
  });

  it("존재하지 않는 코스(null)일 경우 안내 문구를 표시한다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue(null);

    renderComponent("999");

    await waitFor(() => {
      expect(screen.getByText("존재하지 않거나 삭제된 코스입니다.")).toBeInTheDocument();
    });
  });

  it("코스 작성자가 아닌 경우(isOwner가 false) 수정 및 삭제 버튼을 노출하지 않는다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue({
      ...mockCourse,
      isOwner: false,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("강릉 바다 여행")).toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: /코스 수정/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /코스 삭제/i })).not.toBeInTheDocument();
  });
  it("기존 응답에 공유 권한 필드가 없어도 친구 초대 창을 열 수 있다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...mockCourse, isOwner: undefined });
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "친구 초대" }));
    expect(screen.getByRole("dialog", { name: "친구 초대" })).toBeInTheDocument();
  });

  it("초대 UI로 다른 작성자의 코스 관리 권한을 얻지 않는다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...mockCourse, isOwner: false, canEdit: true, membershipRole: "EDITOR" });
    renderComponent();
    await screen.findByRole("heading", { name: mockCourse.title });
    expect(screen.queryByRole("link", { name: "코스 수정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "친구 초대" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "코스 삭제" })).not.toBeInTheDocument();
  });

});
