import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
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

function RouteSearch() {
  const { search } = useLocation();
  return <output data-testid="route-search">{search}</output>;
}

describe("CourseCreatePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
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
        <RouteSearch />
        <CourseCreatePage />
      </MemoryRouter>
    );
  };

  const renderAccommodationEditPage = (initialEntry = "/courses/99/edit", daytrip = false) => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({
      courseId: 99,
      userId: 1,
      title: "숙소를 추가할 여행",
      description: null,
      thumbnail: null,
      visibility: "PRIVATE",
      status: "ACTIVE",
      viewCount: 0,
      likeCount: 0,
      startDate: "2026-09-10",
      endDate: daytrip ? "2026-09-10" : "2026-09-11",
      days: daytrip ? [{ dayNumber: 1, spots: [] }] : [{ dayNumber: 1, spots: [] }, { dayNumber: 2, spots: [] }],
      createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    });
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes><Route path="/courses/:courseId/edit" element={<CourseCreatePage />} /></Routes>
      </MemoryRouter>,
    );
  };

  it("수정 화면에서 숙소 조회 후 비어 있는 첫 일차에 안내를 표시하고 숙소 추가로 연결한다", async () => {
    let resolveAccommodations!: (values: courseService.DayAccommodation[]) => void;
    vi.mocked(courseService.fetchDayAccommodations).mockReturnValue(new Promise((resolve) => {
      resolveAccommodations = resolve;
    }));
    renderAccommodationEditPage();

    await screen.findByDisplayValue("숙소를 추가할 여행");
    expect(screen.queryByRole("complementary", { name: "숙소도 일정에 추가해 보세요" })).not.toBeInTheDocument();
    await act(async () => resolveAccommodations([{ dayNumber: 1, name: "첫날 숙소" }]));

    const dayOne = within(screen.getByTestId("day-card-1"));
    const dayTwo = within(screen.getByTestId("day-card-2"));
    expect(dayOne.queryByRole("complementary")).not.toBeInTheDocument();
    expect(dayTwo.getByRole("complementary", { name: "숙소도 일정에 추가해 보세요" })).toBeVisible();
    const addAccommodation = dayTwo.getByRole("button", { name: /숙소 추가/ });
    expect(addAccommodation).toHaveAccessibleDescription("머무를 숙소를 등록하면 지도에서 여행 동선을 함께 확인할 수 있어요.");
    fireEvent.click(addAccommodation);
    expect(screen.getByRole("dialog", { name: "Day 2 숙소 추가" })).toBeVisible();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("숙소 안내 닫기는 현재 화면에만 적용하고 다시 보지 않기는 수정 화면 재방문에도 유지한다", async () => {
    const firstVisit = renderAccommodationEditPage();
    const closeHint = await screen.findByRole("button", { name: "숙소 안내 닫기" });
    fireEvent.click(closeHint);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("day-card-1")).getByRole("button", { name: /숙소 추가/ })).toHaveFocus();
    expect(localStorage.getItem("planfix:accommodation-hint-dismissed")).toBeNull();

    firstVisit.unmount();
    const secondVisit = renderAccommodationEditPage();
    fireEvent.click(await screen.findByRole("button", { name: "다시 보지 않기" }));
    expect(localStorage.getItem("planfix:accommodation-hint-dismissed")).toBe("true");
    secondVisit.unmount();

    renderAccommodationEditPage();
    await screen.findByDisplayValue("숙소를 추가할 여행");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("모든 일차에 숙소가 있으면 추가 안내를 표시하지 않는다", async () => {
    vi.mocked(courseService.fetchDayAccommodations).mockResolvedValue([
      { dayNumber: 1, name: "첫날 숙소" },
      { dayNumber: 2, name: "둘째 날 숙소" },
    ]);
    renderAccommodationEditPage();
    await screen.findByText("둘째 날 숙소");
    expect(screen.getAllByRole("button", { name: /숙소 변경/ })).toHaveLength(2);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("숙소 조회가 실패하면 기존 숙소가 없는 것으로 안내하지 않는다", async () => {
    vi.mocked(courseService.fetchDayAccommodations).mockRejectedValue(new Error("network unavailable"));
    renderAccommodationEditPage();
    await screen.findByDisplayValue("숙소를 추가할 여행");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("당일치기 수정 화면에서는 숙소 추가 안내를 숨긴다", async () => {
    renderAccommodationEditPage("/courses/99/edit", true);
    await screen.findByDisplayValue("숙소를 추가할 여행");
    expect(screen.queryByRole("button", { name: /숙소 추가/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("기존 당일치기 코스에 등록된 숙소는 계속 확인하고 변경할 수 있다", async () => {
    vi.mocked(courseService.fetchDayAccommodations).mockResolvedValue([{ dayNumber: 1, name: "기존 숙소" }]);
    renderAccommodationEditPage("/courses/99/edit", true);
    await screen.findByText("기존 숙소");
    fireEvent.click(screen.getByRole("button", { name: /숙소 변경/ }));
    expect(screen.getByRole("dialog", { name: "Day 1 숙소 추가" })).toBeVisible();
  });

  it("초기 렌더링 시 기본 날짜 범위에 맞춰 Day 카드가 렌더링된다", () => {
    renderPage();
    expect(screen.getByText("나만의 여행 코스 만들기")).toBeInTheDocument();
    expect(screen.getByTestId("day-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("day-card-2")).toBeInTheDocument();
    expect(screen.getByTestId("day-card-3")).toBeInTheDocument();
    expect(screen.queryByTestId("day-theme-1")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "숙소도 일정에 추가해 보세요" })).not.toBeInTheDocument();
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

  it("여러 지역의 코스를 복원해도 선택한 일차의 지역 안에서 장소를 검색한다", async () => {
    sessionStorage.setItem("planfix:course-draft", JSON.stringify({
      title: "강릉과 속초 여행",
      days: [
        [{ spotId: 1, title: "강릉 장소", category: "관광지", region: "51", sigungu: "150", memo: "" }],
        [{ spotId: 2, title: "속초 장소", category: "관광지", region: "강원도", sigungu: "속초시", memo: "" }],
      ],
    }));
    renderPage();

    fireEvent.click(within(screen.getByTestId("day-card-2")).getByRole("button", { name: /장소 추가/ }));

    await waitFor(() => expect(spotService.searchSpots).toHaveBeenLastCalledWith(expect.objectContaining({
      region: "51", sigungu: "210",
    })));
  });

  it("빈 일차에서는 다른 일차에 담긴 여러 지역을 모두 선택해 검색할 수 있다", async () => {
    sessionStorage.setItem("planfix:course-draft", JSON.stringify({
      title: "강릉과 속초 여행",
      days: [
        [{ spotId: 1, title: "강릉 장소", category: "관광지", region: "51", sigungu: "150", memo: "" }],
        [{ spotId: 2, title: "속초 장소", category: "관광지", region: "51", sigungu: "210", memo: "" }],
        [],
      ],
    }));
    renderPage();

    fireEvent.click(within(screen.getByTestId("day-card-3")).getByRole("button", { name: /장소 추가/ }));

    await waitFor(() => expect(spotService.searchSpots).toHaveBeenLastCalledWith(expect.objectContaining({
      region: "51", sigungu: "150",
    })));
    const regionSelect = screen.getByRole("combobox", { name: "검색 지역" });
    const options = within(regionSelect).getAllByRole("option") as HTMLOptionElement[];
    expect(options.map((option) => option.textContent)).toEqual(["강원 강릉", "강원 속초"]);
    fireEvent.change(regionSelect, { target: { value: options[1].value } });
    await waitFor(() => expect(spotService.searchSpots).toHaveBeenLastCalledWith(expect.objectContaining({
      region: "51", sigungu: "210",
    })));
  });

  it("빈 코스의 장소 검색은 강원으로 제한하고 지역을 선택할 수 있다", async () => {
    renderPage();
    fireEvent.click(within(screen.getByTestId("day-card-1")).getByRole("button", { name: /장소 추가/ }));

    await waitFor(() => expect(spotService.searchSpots).toHaveBeenLastCalledWith(expect.objectContaining({
      region: "51",
    })));
    const regionSelect = screen.getByRole("combobox", { name: "검색 지역" });
    expect(within(regionSelect).getAllByRole("option")).toHaveLength(19);
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
        { dayNumber: 1, themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"], spots: [{
          spotId: 101, title: "경포해변", category: "관광지", region: "51", sigungu: "150",
          address: null, thumbnail: null, latitude: null, longitude: null, reason: "바다를 즐길 수 있어요.",
        }] },
        { dayNumber: 2, themes: ["CAFE"], tripIdeas: ["CAFE"], spots: [] },
        { dayNumber: 3, themes: ["HEALING"], tripIdeas: ["NATURE"], spots: [] },
      ],
    }));
    vi.mocked(courseService.createCourse).mockResolvedValue({ courseId: 123 } as courseService.CourseResponse);
    const page = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "AI에게 맡기기" }));
    fireEvent.click(screen.getByRole("button", { name: "테마 직접 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "취향 세부 조정" }));
    fireEvent.click(screen.getByRole("button", { name: "힐링·자연" }));
    fireEvent.click(screen.getByRole("button", { name: "카페 투어" }));
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(screen.getByTestId("day-card-1")).getByTestId("day-theme-1")).toHaveTextContent("바다와 카페");
    expect(within(screen.getByTestId("day-card-2")).getByTestId("day-theme-2")).toHaveTextContent("여유로운 카페 투어");
    expect(within(screen.getByTestId("day-card-3")).getByTestId("day-theme-3")).toHaveTextContent("자연 속 쉼");
    fireEvent.change(screen.getByDisplayValue("바다를 즐길 수 있어요."), { target: { value: "오전 바다 산책" } });
    expect(JSON.parse(sessionStorage.getItem("planfix:course-draft")!)).toEqual(expect.objectContaining({
      generatedBy, themes: ["HEALING", "CAFE"],
      dayThemes: {
        1: { themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"] },
        2: { themes: ["CAFE"], tripIdeas: ["CAFE"] },
        3: { themes: ["HEALING"], tripIdeas: ["NATURE"] },
      },
    }));

    page.unmount();
    renderPage();
    expect(screen.getByText(generatedBy === "LLM" ? "AI로 만든 코스" : "맞춤 추천 코스")).toBeInTheDocument();
    expect(screen.getByText("카페 투어")).toBeInTheDocument();
    expect(screen.getByTestId("day-theme-1")).toHaveTextContent("바다와 카페");
    expect(screen.getByTestId("day-theme-2")).toHaveTextContent("여유로운 카페 투어");
    expect(screen.getByTestId("day-theme-3")).toHaveTextContent("자연 속 쉼");
    fireEvent.click(screen.getByRole("button", { name: "코스 저장하기" }));
    await waitFor(() => expect(courseService.createCourse).toHaveBeenCalledWith(expect.objectContaining({
      generatedBy, themes: ["HEALING", "CAFE"],
      days: [
        { dayNumber: 1, themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"], spots: [{ spotId: 101, memo: "오전 바다 산책" }] },
        { dayNumber: 2, themes: ["CAFE"], tripIdeas: ["CAFE"], spots: [] },
        { dayNumber: 3, themes: ["HEALING"], tripIdeas: ["NATURE"], spots: [] },
      ],
    })));
  });

  it("일정을 줄인 뒤 다시 늘려도 삭제된 일차의 테마를 되살리지 않는다", () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    sessionStorage.setItem("planfix:course-draft", JSON.stringify({
      title: "날짜별 취향 여행", description: "", startDate: `${month}-10`, endDate: `${month}-12`,
      days: [[], [], []],
      dayThemes: {
        1: { themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"] },
        2: { themes: ["CULTURE", "FOOD"], tripIdeas: ["CULTURE_LOCAL"] },
        3: { themes: ["CAFE"], tripIdeas: ["CAFE"] },
      },
    }));
    renderPage();

    const applyRange = (endDay: number) => {
      fireEvent.click(screen.getByRole("button", { name: /~/ }));
      const label = (day: number) => `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${day}일`;
      fireEvent.click(screen.getByRole("button", { name: label(10) }));
      fireEvent.click(screen.getByRole("button", { name: label(endDay) }));
      fireEvent.click(screen.getByRole("button", { name: "적용" }));
    };

    applyRange(11);
    expect(screen.queryByTestId("day-card-3")).not.toBeInTheDocument();
    expect(screen.getByTestId("day-theme-1")).toHaveTextContent("신나는 액티비티");
    expect(screen.getByTestId("day-theme-2")).toHaveTextContent("문화와 골목 여행");
    applyRange(12);
    expect(screen.getByTestId("day-card-3")).toBeInTheDocument();
    expect(screen.queryByTestId("day-theme-3")).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("planfix:course-draft")!).dayThemes).toEqual({
      1: { themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"] },
      2: { themes: ["CULTURE", "FOOD"], tripIdeas: ["CULTURE_LOCAL"] },
    });
  });

  it("AI가 명시적으로 비운 일차 테마는 복원과 저장까지 빈 배열로 유지하고 기존 누락 필드와 구분한다", async () => {
    vi.mocked(fetchAiCourseDraft).mockImplementation(async (request) => ({
      title: "하루는 자유롭게", startDate: request.startDate, endDate: request.endDate, generatedBy: "LLM",
      days: [
        { dayNumber: 1, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"], spots: [{
          spotId: 101, title: "강릉 서핑", category: "레포츠", region: "51", sigungu: "150",
          address: null, thumbnail: null, latitude: null, longitude: null, reason: "서핑 체험",
        }] },
        { dayNumber: 2, themes: [], tripIdeas: [], spots: [] },
        { dayNumber: 3, spots: [] },
      ],
    }));
    vi.mocked(courseService.createCourse).mockResolvedValue({ courseId: 123 } as courseService.CourseResponse);
    const page = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "AI에게 맡기기" }));
    fireEvent.click(screen.getByRole("button", { name: "테마 직접 고르기" }));
    fireEvent.click(screen.getByRole("button", { name: "신나는 액티비티" }));
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(JSON.parse(sessionStorage.getItem("planfix:course-draft")!).dayThemes).toEqual({
      1: { themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"] },
      2: { themes: [], tripIdeas: [] },
    });

    page.unmount();
    renderPage();
    expect(screen.getByTestId("day-theme-1")).toHaveTextContent("신나는 액티비티");
    expect(screen.queryByTestId("day-theme-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("day-theme-3")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "코스 저장하기" }));
    await waitFor(() => expect(courseService.createCourse).toHaveBeenCalled());
    expect(vi.mocked(courseService.createCourse).mock.calls[0][0].days).toEqual([
      { dayNumber: 1, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"], spots: [{ spotId: 101, memo: "서핑 체험" }] },
      { dayNumber: 2, themes: [], tripIdeas: [], spots: [] },
      { dayNumber: 3, spots: [] },
    ]);
  });

  it.each([
    { dayThemes: { themes: ["CAFE"], tripIdeas: ["CAFE"] }, label: "여유로운 카페 투어" },
    { dayThemes: { themes: [], tripIdeas: [] }, label: null },
    { dayThemes: {}, label: null },
  ])("저장된 코스를 수정할 때 일차별 테마의 값과 누락 여부를 보존한다 ($label)", async ({ dayThemes, label }) => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({
      courseId: 99, title: "날짜별 테마 여행", startDate: "2026-09-10", endDate: "2026-09-11",
      generatedBy: "LLM", themes: ["ACTIVITY", "CAFE"],
      days: [
        { dayNumber: 1, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"], spots: [{
          spotId: 101, title: "강릉 서핑", category: "레포츠", region: "51", sigungu: "150",
          thumbnail: null, sequence: 0, memo: "서핑 체험",
        }] },
        { dayNumber: 2, ...dayThemes, spots: [] },
      ],
    } as courseService.CourseResponse);
    vi.mocked(courseService.updateCourse).mockResolvedValue({ courseId: 99 } as courseService.CourseResponse);
    render(
      <MemoryRouter initialEntries={["/courses/99/edit"]}>
        <Routes><Route path="/courses/:courseId/edit" element={<CourseCreatePage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("day-theme-1")).toHaveTextContent("신나는 액티비티");
    if (label) expect(screen.getByTestId("day-theme-2")).toHaveTextContent(label);
    else expect(screen.queryByTestId("day-theme-2")).not.toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue("서핑 체험"), { target: { value: "오전 서핑 체험" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 완료" }));
    await waitFor(() => expect(courseService.updateCourse).toHaveBeenCalledWith("99", expect.objectContaining({
      days: [
        { dayNumber: 1, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"], spots: [{ spotId: 101, memo: "오전 서핑 체험" }] },
        { dayNumber: 2, ...dayThemes, spots: [] },
      ],
    })));
  });

  it("URL에 mode=ai가 있는 경우 자동으로 AI 코스 모달이 열린다", async () => {
    renderPage(["/courses/create?mode=ai"]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("AI에게 코스 맡기기")).toBeInTheDocument();
      expect(screen.getByText(/어디로 떠나시나요\?/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText("출발일")).toBeInTheDocument();
    expect(screen.getByLabelText("마지막 날")).toBeInTheDocument();
    expect(screen.getByTestId("route-search")).toBeEmptyDOMElement();
  });

  it("당일치기 바로가기는 복원된 일정과 별도로 날짜를 선택하고 1일 코스로 저장한다", async () => {
    sessionStorage.setItem("planfix:course-draft", JSON.stringify({
      title: "기존 여행", description: "", startDate: "2030-05-10", endDate: "2030-05-12",
      days: [[], [], []],
      dayAccommodations: { 3: { dayNumber: 3, name: "셋째 날 숙소" } },
    }));
    vi.mocked(fetchAiCourseDraft).mockImplementation(async (request) => ({
      title: "당일치기 여행", startDate: request.startDate, endDate: request.endDate, generatedBy: "LLM",
      days: [{ dayNumber: 1, spots: [{
        spotId: 101, title: "경포해변", category: "관광지", region: "51", sigungu: "150",
        address: null, thumbnail: null, latitude: null, longitude: null, reason: "바다 산책",
      }] }],
    }));
    vi.mocked(courseService.createCourse).mockResolvedValue({ courseId: 123 } as courseService.CourseResponse);
    renderPage(["/courses/create?mode=ai&trip=daytrip&source=home"]);

    const travelDate = await screen.findByLabelText("여행 날짜");
    expect(travelDate).toHaveValue("2030-05-10");
    expect(screen.getByTestId("route-search")).toHaveTextContent("?source=home");
    fireEvent.change(travelDate, { target: { value: "2030-05-20" } });
    expect(JSON.parse(sessionStorage.getItem("planfix:course-draft")!)).toMatchObject({
      startDate: "2030-05-10", endDate: "2030-05-12", days: [[], [], []],
    });
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(fetchAiCourseDraft).toHaveBeenCalledWith(expect.objectContaining({
      startDate: "2030-05-20", endDate: "2030-05-20",
    }));
    expect(screen.getByTestId("day-card-1")).toBeInTheDocument();
    expect(screen.queryByTestId("day-card-2")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /숙소 추가/ })).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("planfix:course-draft")!)).toMatchObject({
      startDate: "2030-05-20", endDate: "2030-05-20", dayAccommodations: {},
    });
    fireEvent.click(screen.getByRole("button", { name: "코스 저장하기" }));
    await waitFor(() => expect(courseService.createCourse).toHaveBeenCalledWith(expect.objectContaining({
      startDate: "2030-05-20", endDate: "2030-05-20",
      days: [{ dayNumber: 1, spots: [{ spotId: 101, memo: "바다 산책" }] }],
    })));
    expect(courseService.saveDayAccommodations).toHaveBeenCalledWith(123, []);
  });

  it("당일치기 모달을 취소하면 복원한 숙박 일정과 날짜를 유지하고 다시 열 때 숙박 모드로 연다", async () => {
    sessionStorage.setItem("planfix:course-draft", JSON.stringify({
      title: "보존할 여행", description: "", startDate: "2030-05-10", endDate: "2030-05-12",
      days: [[], [], []],
    }));
    renderPage(["/courses/create?mode=ai&trip=daytrip"]);
    fireEvent.change(await screen.findByLabelText("여행 날짜"), { target: { value: "2030-05-20" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("day-card-3")).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("planfix:course-draft")!)).toMatchObject({
      title: "보존할 여행", startDate: "2030-05-10", endDate: "2030-05-12", days: [[], [], []],
    });
    fireEvent.click(screen.getByRole("button", { name: "AI에게 맡기기" }));
    expect(screen.getByLabelText("출발일")).toHaveValue("2030-05-10");
    expect(screen.getByLabelText("마지막 날")).toHaveValue("2030-05-12");
    expect(screen.queryByLabelText("여행 날짜")).not.toBeInTheDocument();
  });

  it("일반 AI 진입은 임시저장된 날짜 복원 후 모달을 연다", async () => {
    sessionStorage.setItem("planfix:course-draft", JSON.stringify({
      title: "다음 달 여행", description: "", startDate: "2030-06-01", endDate: "2030-06-02",
      days: [[], []],
    }));
    renderPage(["/courses/create?mode=ai"]);
    expect(await screen.findByLabelText("출발일")).toHaveValue("2030-06-01");
    expect(screen.getByLabelText("마지막 날")).toHaveValue("2030-06-02");
    expect(screen.getByTestId("day-card-2")).toBeInTheDocument();
    expect(screen.queryByTestId("day-card-3")).not.toBeInTheDocument();
  });

  it("수정 모드에서는 AI 진입 파라미터가 있어도 원래 코스를 유지한다", async () => {
    renderAccommodationEditPage("/courses/99/edit?mode=ai&trip=daytrip");
    await screen.findByDisplayValue("숙소를 추가할 여행");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("day-card-2")).toBeInTheDocument();
    expect(sessionStorage.getItem("planfix:course-draft")).toBeNull();
  });
});
