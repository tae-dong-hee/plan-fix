import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CourseCreatePage from "./course-create-page";
import * as courseService from "@/services/course";
import * as spotService from "@/services/spots";
import * as sharingService from "@/services/course-sharing";

vi.mock("@/services/course");
vi.mock("@/services/course-sharing");
vi.mock("@/services/spots");

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
    expect(screen.queryByRole("button", { name: "취소" })).not.toBeInTheDocument();
  });

  it("빈 제목으로 저장을 누르면 안내를 표시하고 제목 입력란으로 이동한다", () => {
    renderPage();
    const titleInput = screen.getByPlaceholderText(/2박 3일 강릉 힐링/i);
    const saveButton = screen.getByRole("button", { name: "코스 저장하기" });
    expect(saveButton).toBeEnabled();
    expect(screen.getByText(/코스 제목을 입력해주세요/i)).toBeInTheDocument();

    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.click(saveButton);

    expect(screen.getByRole("alert")).toHaveTextContent("코스 제목을 입력해주세요.");
    expect(titleInput).toHaveFocus();
    expect(courseService.createCourse).not.toHaveBeenCalled();
    expect(sharingService.updateCourseItinerary).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("제목만 입력하고 저장을 누르면 첫 Day의 장소 추가 버튼으로 안내한다", () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/2박 3일 강릉 힐링/i), {
      target: { value: "강릉 바다 여행" },
    });
    const saveButton = screen.getByRole("button", { name: "코스 저장하기" });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(screen.getByRole("alert")).toHaveTextContent("최소 1개 이상의 장소를 일정에 추가해야 저장할 수 있습니다.");
    expect(within(screen.getByTestId("day-card-1")).getByRole("button", { name: /장소 추가/i })).toHaveFocus();
    expect(courseService.createCourse).not.toHaveBeenCalled();
    expect(sharingService.updateCourseItinerary).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
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

  it("저장 버튼 클릭 시 createCourse를 호출하고 상세 화면으로 이동한다", async () => {
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
          days: expect.arrayContaining([
            expect.objectContaining({
              dayNumber: 1,
              spots: [expect.objectContaining({ spotId: 101 })],
            }),
          ]),
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith("/courses/123", { replace: true, state: { courseSaveAction: "created" } });
    });
  });

  it("저장 중에는 중복 클릭을 막고 응답을 받은 뒤에만 상세 화면으로 이동한다", async () => {
    let resolveSave!: (value: unknown) => void;
    (courseService.createCourse as Mock).mockImplementation(
      () => new Promise((resolve) => { resolveSave = resolve; })
    );
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/2박 3일 강릉 힐링/i), {
      target: { value: "강릉 바다 여행" },
    });
    fireEvent.click(within(screen.getByTestId("day-card-1")).getByRole("button", { name: /장소 추가/i }));
    await waitFor(() => expect(screen.getByText("경포해변")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "선택" }));

    const saveButton = screen.getByRole("button", { name: "코스 저장하기" });
    fireEvent.click(saveButton);
    expect(saveButton).toBeDisabled();
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);
    expect(courseService.createCourse).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("강릉 바다 여행")).toBeInTheDocument();

    await act(async () => {
      resolveSave({ courseId: 123, title: "강릉 바다 여행", days: [] });
    });
    expect(mockNavigate).toHaveBeenCalledExactlyOnceWith("/courses/123", {
      replace: true,
      state: { courseSaveAction: "created" },
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
      expect(screen.getByRole("alert")).toHaveTextContent("저장 실패 서버 에러");
      expect(screen.getByDisplayValue("강릉 바다 여행")).toBeInTheDocument();
      expect(screen.getByText("경포해변")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "코스 저장하기" })).toBeEnabled();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("수정 모드일 때 기존 코스 정보를 불러오고, 수정 완료 시 updateCourse를 호출한다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue({
      courseId: 99,
      userId: 1,
      title: "원래 코스 제목",
      description: "원래 코스 설명",
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
          days: expect.arrayContaining([
            expect.objectContaining({
              dayNumber: 1,
              spots: [expect.objectContaining({ spotId: 101 })],
            }),
          ]),
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith("/courses/99", { replace: true, state: { courseSaveAction: "updated" } });
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
      expect(mockNavigate).toHaveBeenCalledWith("/courses/456", { replace: true, state: { courseSaveAction: "created" } });
    });
  });

  it("URL에 mode=ai가 있는 경우 자동으로 AI 코스 모달이 열린다", async () => {
    renderPage(["/courses/create?mode=ai"]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("AI에게 코스 맡기기")).toBeInTheDocument();
      expect(screen.getByText(/어디로 떠나시나요\?/i)).toBeInTheDocument();
    });
  });
  it("기존 코스 응답으로 수정하면 기존 수정 API에 원래 형식으로 저장한다", async () => {
    const course: courseService.CourseResponse = {
      courseId: 99, userId: 3, title: "친구의 코스", description: "함께하는 여행", thumbnail: null,
      visibility: "PRIVATE", status: "ACTIVE", viewCount: 0, likeCount: 0,
      startDate: "2026-09-10", endDate: "2026-09-10", isOwner: true,
      createdAt: "2026-09-09T00:00:00Z", updatedAt: "2026-09-09T01:00:00.123456Z",
      days: [{ dayNumber: 1, spots: [{ spotId: 101, title: "경포해변", sequence: 0, memo: "오전 산책", category: "관광지", region: null, sigungu: null, address: null, thumbnail: null, latitude: null, longitude: null }] }],
    };
    vi.mocked(courseService.fetchCourse).mockResolvedValue(course);
    vi.mocked(courseService.updateCourse).mockResolvedValue(course);
    render(<MemoryRouter initialEntries={["/courses/99/edit"]}><Routes><Route path="/courses/:courseId/edit" element={<CourseCreatePage />} /></Routes></MemoryRouter>);
    expect(await screen.findByDisplayValue("친구의 코스")).toBeEnabled();
    expect(screen.getByDisplayValue("함께하는 여행")).toBeEnabled();
    expect(screen.getByTestId("visibility-public-button")).toBeEnabled();
    fireEvent.change(screen.getByDisplayValue("오전 산책"), { target: { value: "오후 산책" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 완료" }));
    await waitFor(() => expect(courseService.updateCourse).toHaveBeenCalledWith("99", {
      title: "친구의 코스", description: "함께하는 여행", visibility: "PRIVATE",
      startDate: "2026-09-10", endDate: "2026-09-10",
      days: [{ dayNumber: 1, spots: [{ spotId: 101, memo: "오후 산책" }] }],
    }));
    expect(sharingService.updateCourseItinerary).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/courses/99", { replace: true, state: { courseSaveAction: "updated" } });
  });

  it("보기 전용 사용자가 수정 주소로 들어와도 수정 폼을 열지 않는다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({
      courseId: 99, title: "보기 전용", description: null, days: [], isOwner: false, canEdit: false, membershipRole: "VIEWER",
    } as unknown as courseService.CourseResponse);
    render(<MemoryRouter initialEntries={["/courses/99/edit"]}><Routes><Route path="/courses/:courseId/edit" element={<CourseCreatePage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "코스를 수정할 권한이 없어요" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수정 완료" })).not.toBeInTheDocument();
    expect(sharingService.updateCourseItinerary).not.toHaveBeenCalled();
  });

});
