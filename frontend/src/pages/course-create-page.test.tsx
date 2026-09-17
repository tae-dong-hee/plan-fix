import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CourseCreatePage from "./course-create-page";
import * as courseService from "@/services/course";
import * as spotService from "@/services/spots";
import { fetchAiCourseDraft } from "@/services/ai-course";

vi.mock("@/services/course");
vi.mock("@/services/spots");
vi.mock("@/services/ai-course", async () => ({
  ...await vi.importActual<typeof import("@/services/ai-course")>("@/services/ai-course"),
  fetchAiCourseDraft: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("CourseCreatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    (courseService.fetchDayAccommodations as Mock).mockResolvedValue([]);
    (courseService.saveDayAccommodations as Mock).mockResolvedValue(undefined);
    (spotService.searchSpots as Mock).mockResolvedValue({
      items: [
        {
          spotId: 101,
          title: "경포해변",
          category: "관광지",
          region: "51",
          sigungu: "150",
          thumbnail: null,
        },
      ],
      offset: 0,
      size: 20,
      totalCount: 1,
    });
  });

  const renderPage = (initialEntries = ["/"]) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <CourseCreatePage />
      </MemoryRouter>
    );
  };

  it("초기 렌더링 시 기본 날짜 범위에 맞춰 Day 카드가 렌더링된다", () => {
    renderPage();
    expect(screen.getByText("나만의 여행 코스 만들기")).toBeInTheDocument();
    expect(screen.getByTestId("day-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("day-card-2")).toBeInTheDocument();
    expect(screen.getByTestId("day-card-3")).toBeInTheDocument();
  });

  it("제목이 없거나 담긴 장소가 0개이면 저장 버튼이 비활성화된다", () => {
    renderPage();
    const saveButton = screen.getByRole("button", { name: "코스 저장하기" });
    expect(saveButton).toBeDisabled();
    expect(screen.getByText(/코스 제목을 입력해주세요/i)).toBeInTheDocument();
  });

  it("장소 추가를 누르면 모달이 열리고 장소를 선택하면 해당 Day에 추가된다", async () => {
    renderPage();

    const titleInput = screen.getByPlaceholderText(/2박 3일 강릉 힐링/i);
    fireEvent.change(titleInput, { target: { value: "강릉 바다 여행" } });

    // Day 1의 장소 추가 버튼 클릭
    const addButtons = screen.getAllByRole("button", { name: /장소 추가/i });
    fireEvent.click(addButtons[0]);

    // 모달 오픈 확인 및 장소 선택
    await waitFor(() => {
      expect(screen.getByText("Day 1에 추가")).toBeInTheDocument();
      expect(screen.getByText("경포해변")).toBeInTheDocument();
    });

    const selectButton = screen.getByRole("button", { name: "선택" });
    fireEvent.click(selectButton);

    // Day 1에 장소가 추가되었는지 확인
    await waitFor(() => {
      expect(screen.getByText("경포해변")).toBeInTheDocument();
    });

    // 이제 저장이 활성화됨
    const saveButton = screen.getByRole("button", { name: "코스 저장하기" });
    expect(saveButton).not.toBeDisabled();
  });

  it("새 코스 저장 시 대표사진은 null로 전송하고 상세 화면으로 이동한다", async () => {
    (courseService.createCourse as Mock).mockResolvedValue({
      courseId: 123,
      title: "강릉 바다 여행",
      days: [],
    });

    renderPage();

    const titleInput = screen.getByPlaceholderText(/2박 3일 강릉 힐링/i);
    fireEvent.change(titleInput, { target: { value: "강릉 바다 여행" } });

    const addButtons = screen.getAllByRole("button", { name: /장소 추가/i });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("경포해변")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "선택" }));

    await waitFor(() => {
      expect(screen.getByText("경포해변")).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: "코스 저장하기" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(courseService.createCourse).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "강릉 바다 여행",
          thumbnail: null,
          generatedBy: "MANUAL",
          themes: [],
          days: expect.arrayContaining([
            expect.objectContaining({
              dayNumber: 1,
              spots: [expect.objectContaining({ spotId: 101 })],
            }),
          ]),
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith("/courses/123", { replace: true });
    });
  });

  it("여행 기간 버튼을 누르면 캘린더가 열리고 시작일/종료일을 선택해 적용하면 Day 카드 수가 바뀐다", async () => {
    renderPage();

    const rangeButton = screen.getByRole("button", { name: /~/ });
    fireEvent.click(rangeButton);

    expect(screen.getByText("여행 기간 선택")).toBeInTheDocument();

    // 현재 보여지는 달의 10일/11일을 골라 1박 2일로 만든다 (오늘 날짜에 의존하지 않게 고정 날짜 사용)
    const now = new Date();
    const label = (day: number) => `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${day}일`;

    fireEvent.click(screen.getByRole("button", { name: label(10) }));

    // 시작일만 고르면 아직 적용 버튼이 비활성화 상태
    expect(screen.getByRole("button", { name: "적용" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: label(11) }));

    const applyButton = screen.getByRole("button", { name: "적용" });
    expect(applyButton).not.toBeDisabled();
    fireEvent.click(applyButton);

    // 모달이 닫히고 2일 일정(1박 2일)으로 Day 카드가 바뀐다
    await waitFor(() => {
      expect(screen.queryByText("여행 기간 선택")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("day-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("day-card-2")).toBeInTheDocument();
    expect(screen.queryByTestId("day-card-3")).not.toBeInTheDocument();
  });

  it("취소 버튼을 누르면 기간 변경 없이 캘린더가 닫힌다", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /~/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("여행 기간 선택")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() => {
      expect(screen.queryByText("여행 기간 선택")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("day-card-3")).toBeInTheDocument();
  });

  it("저장 실패 시 에러 메시지를 표시하고 입력 상태를 유지한다", async () => {
    (courseService.createCourse as Mock).mockRejectedValue(new Error("저장 실패 서버 에러"));

    renderPage();

    const titleInput = screen.getByPlaceholderText(/2박 3일 강릉 힐링/i);
    fireEvent.change(titleInput, { target: { value: "강릉 바다 여행" } });

    const addButtons = screen.getAllByRole("button", { name: /장소 추가/i });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("경포해변")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "선택" }));

    await waitFor(() => {
      expect(screen.getByText("경포해변")).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: "코스 저장하기" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("저장 실패 서버 에러")).toBeInTheDocument();
      expect(screen.getByDisplayValue("강릉 바다 여행")).toBeInTheDocument();
    });
  });

  it.each([
    { generatedBy: "LLM", themes: ["HEALING"] },
    { generatedBy: null, themes: undefined },
  ])("기존 코스 제목을 수정해도 대표사진과 생성 정보($generatedBy)를 보존한다", async ({ generatedBy, themes }) => {
    (courseService.fetchCourse as Mock).mockResolvedValue({
      courseId: 99,
      userId: 1,
      title: "원래 코스 제목",
      description: "원래 코스 설명",
      generatedBy,
      themes,
      thumbnail: "https://example.com/existing-course-cover.jpg",
      startDate: "2026-09-10",
      endDate: "2026-09-11",
      days: [
        {
          dayNumber: 1,
          spots: [
            {
              spotId: 101,
              sequence: 0,
              memo: "원래 메모",
              title: "경포해변",
              category: "관광지",
              region: "51",
              sigungu: "150",
              thumbnail: null,
            },
          ],
        },
        {
          dayNumber: 2,
          spots: [],
        },
      ],
    });

    (courseService.updateCourse as Mock).mockResolvedValue({
      courseId: 99,
      title: "수정된 코스 제목",
      days: [],
    });

    render(
      <MemoryRouter initialEntries={["/courses/99/edit"]}>
        <Routes>
          <Route path="/courses/:courseId/edit" element={<CourseCreatePage />} />
        </Routes>
      </MemoryRouter>
    );

    // 로딩 완료 후 수정 헤더 및 기존 데이터 확인
    await waitFor(() => {
      expect(screen.getByText("여행 코스 수정하기")).toBeInTheDocument();
      expect(screen.getByDisplayValue("원래 코스 제목")).toBeInTheDocument();
      expect(screen.getByDisplayValue("원래 코스 설명")).toBeInTheDocument();
      expect(screen.getByText("경포해변")).toBeInTheDocument();
    });

    // 제목 변경
    const titleInput = screen.getByDisplayValue("원래 코스 제목");
    fireEvent.change(titleInput, { target: { value: "수정된 코스 제목" } });

    // 수정 완료 버튼 클릭
    const submitButton = screen.getByRole("button", { name: "수정 완료" });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(courseService.updateCourse).toHaveBeenCalledWith(
        "99",
        expect.objectContaining({
          title: "수정된 코스 제목",
          thumbnail: "https://example.com/existing-course-cover.jpg",
          generatedBy,
          themes,
          days: expect.arrayContaining([
            expect.objectContaining({
              dayNumber: 1,
              spots: [expect.objectContaining({ spotId: 101 })],
            }),
          ]),
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith("/courses/99", { replace: true });
    });
  });

  it("공개 여부 버튼을 클릭하여 비공개(PRIVATE)로 변경하여 저장할 수 있다", async () => {
    (courseService.createCourse as Mock).mockResolvedValue({
      courseId: 456,
      title: "비밀 여행",
      days: [],
    });

    renderPage();

    const titleInput = screen.getByPlaceholderText(/2박 3일 강릉 힐링/i);
    fireEvent.change(titleInput, { target: { value: "비밀 여행" } });

    // 장소 추가
    const addButtons = screen.getAllByRole("button", { name: /장소 추가/i });
    fireEvent.click(addButtons[0]);
    await waitFor(() => expect(screen.getByText("경포해변")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "선택" }));
    await waitFor(() => expect(screen.getByText("경포해변")).toBeInTheDocument());

    // 비공개 버튼 클릭
    const privateButton = screen.getByTestId("visibility-private-button");
    fireEvent.click(privateButton);

    const saveButton = screen.getByRole("button", { name: "코스 저장하기" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(courseService.createCourse).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "비밀 여행",
          visibility: "PRIVATE",
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith("/courses/456", { replace: true });
    });
  });

  it.each(["LLM", "RULE_BASED"] as const)("%s 초안의 생성 방식과 선택 테마를 임시저장 복원 후에도 코스에 저장한다", async (generatedBy) => {
    vi.mocked(fetchAiCourseDraft).mockImplementation(async (request) => ({
      title: "취향을 담은 여행",
      startDate: request.startDate,
      endDate: request.endDate,
      generatedBy,
      days: [
        { dayNumber: 1, spots: [{
          spotId: 101, title: "경포해변", category: "관광지", region: "51", sigungu: "150",
          address: null, thumbnail: null, latitude: null, longitude: null, reason: "바다를 즐길 수 있어요.",
        }] },
        { dayNumber: 2, spots: [] },
        { dayNumber: 3, spots: [] },
      ],
    }));
    vi.mocked(courseService.createCourse).mockResolvedValue({ courseId: 123 } as courseService.CourseResponse);
    const page = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "AI에게 맡기기" }));
    fireEvent.click(screen.getByRole("button", { name: "힐링·자연" }));
    fireEvent.click(screen.getByRole("button", { name: "카페 투어" }));
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(JSON.parse(sessionStorage.getItem("planfix:course-draft")!)).toEqual(expect.objectContaining({
      generatedBy, themes: ["HEALING", "CAFE"],
    }));

    page.unmount();
    renderPage();
    expect(screen.getByText(generatedBy === "LLM" ? "AI로 만든 코스" : "맞춤 추천 코스")).toBeInTheDocument();
    expect(screen.getByText("카페 투어")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "코스 저장하기" }));
    await waitFor(() => expect(courseService.createCourse).toHaveBeenCalledWith(expect.objectContaining({
      generatedBy, themes: ["HEALING", "CAFE"],
    })));
  });

  it("URL에 mode=ai가 있는 경우 자동으로 AI 코스 모달이 열린다", async () => {
    renderPage(["/courses/create?mode=ai"]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("AI에게 코스 맡기기")).toBeInTheDocument();
      expect(screen.getByText(/어디로 떠나시나요\?/i)).toBeInTheDocument();
    });
  });
});
