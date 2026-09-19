import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import AiCourseModal from "@/components/ui/ai-course-modal";
import { sigunguCodeByRegion } from "@/components/ui/gangwon-region-map";
import { fetchAiCourseDraft, type AiCourseDraft } from "@/services/ai-course";
import { searchSpots, UnauthorizedError, type PopularSpot } from "@/services/spots";

vi.mock("@/services/ai-course", async () => {
  const actual = await vi.importActual<typeof import("@/services/ai-course")>("@/services/ai-course");
  return { ...actual, fetchAiCourseDraft: vi.fn() };
});

vi.mock("@/services/spots", async () => {
  const actual = await vi.importActual<typeof import("@/services/spots")>("@/services/spots");
  return { ...actual, searchSpots: vi.fn() };
});

const draft: AiCourseDraft = {
  title: "2박 3일 여행 코스",
  startDate: "2026-09-14",
  endDate: "2026-09-16",
  days: [{ dayNumber: 1, spots: [] }],
  generatedBy: "LLM",
};

const anchor: PopularSpot = {
  spotId: 101,
  title: "경포해변",
  category: "관광지",
  region: "51",
  sigungu: "150",
  thumbnail: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function renderModal() {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const props = { open: true, startDate: draft.startDate, endDate: draft.endDate, onApply, onClose };
  return { ...render(<AiCourseModal {...props} />), props, onApply, onClose };
}

describe("AiCourseModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fetchAiCourseDraft).mockResolvedValue(draft);
    vi.mocked(searchSpots).mockResolvedValue({ items: [anchor], offset: 0, size: 5, totalCount: 1 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("세부 정보를 입력하지 않아도 기존 날짜로 강원 전체 추천을 요청한다", async () => {
    const { onApply } = renderModal();
    const submit = screen.getByRole("button", { name: "AI로 코스 만들기" });

    expect(submit).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "여행 지역" })).toHaveValue("");
    expect(screen.queryByRole("textbox", { name: "고정할 장소 검색" })).not.toBeInTheDocument();
    fireEvent.click(submit);

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, []));
    const request = vi.mocked(fetchAiCourseDraft).mock.calls[0][0];
    expect(request).toEqual(expect.objectContaining({
      region: "51",
      startDate: "2026-09-14",
      endDate: "2026-09-16",
      companion: "COUPLE",
      themes: [],
      anchorSpotIds: [],
    }));
    expect(request.sigungu).toBeUndefined();
    expect(request).not.toHaveProperty("dayThemes");
  });

  it.each([
    { name: "힐링·자연", theme: "HEALING" },
    { name: "맛집 탐방", theme: "FOOD" },
    { name: "카페 투어", theme: "CAFE" },
    { name: "액티비티", theme: "ACTIVITY" },
    { name: "문화·역사", theme: "CULTURE" },
  ])("'$name' 테마를 세부 설정을 열지 않고 선택하며 여행지를 유지한다", async ({ name, theme }) => {
    const { onApply } = renderModal();
    const region = screen.getByRole("combobox", { name: "여행 지역" });
    fireEvent.change(region, { target: { value: "춘천" } });
    const themeButton = screen.getByRole("button", { name });

    expect(themeButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(themeButton);
    expect(themeButton).toHaveAttribute("aria-pressed", "true");
    expect(region).toHaveValue("춘천");
    expect(screen.queryByRole("textbox", { name: "고정할 장소 검색" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, [theme]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      sigungu: sigunguCodeByRegion.춘천,
      themes: [theme],
    }));
  });

  it.each([
    { name: "바다와 카페", themes: ["HEALING", "CAFE"] },
    { name: "맛집과 산책", themes: ["HEALING", "FOOD"] },
    { name: "자연 속 쉼", themes: ["HEALING"] },
    { name: "신나는 액티비티", themes: ["ACTIVITY"] },
    { name: "문화와 골목 여행", themes: ["CULTURE", "FOOD"] },
    { name: "여유로운 카페 투어", themes: ["CAFE"] },
  ])("'$name' 추천을 선택하면 해당 테마와 선택한 지역으로 요청한다", async ({ name, themes }) => {
    const { onApply } = renderModal();
    const region = screen.getByRole("combobox", { name: "여행 지역" });
    fireEvent.change(region, { target: { value: "춘천" } });
    const recommendation = screen.getByRole("button", { name });
    fireEvent.click(recommendation);
    expect(recommendation).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "AI에게 테마 맡기기" })).toHaveAttribute("aria-pressed", "false");
    expect(region).toHaveValue("춘천");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, themes));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      sigungu: sigunguCodeByRegion.춘천,
      themes,
    }));
  });

  it("같은 추천을 다시 누르면 지역을 유지한 채 AI 자동 추천으로 돌아간다", async () => {
    const { onApply } = renderModal();
    const region = screen.getByRole("combobox", { name: "여행 지역" });
    fireEvent.change(region, { target: { value: "속초" } });
    const recommendation = screen.getByRole("button", { name: "바다와 카페" });

    fireEvent.click(recommendation);
    fireEvent.click(recommendation);
    expect(recommendation).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "힐링·자연" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "카페 투어" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "AI에게 테마 맡기기" })).toHaveAttribute("aria-pressed", "true");
    expect(region).toHaveValue("속초");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, []));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      sigungu: sigunguCodeByRegion.속초,
      themes: [],
    }));
  });

  it("추천 카드는 독립적으로 중복 선택하고 수동 테마를 더해도 선택을 유지한다", () => {
    renderModal();
    const recommendation = screen.getByRole("button", { name: "문화와 골목 여행" });
    fireEvent.click(screen.getByRole("button", { name: "맛집 탐방" }));
    fireEvent.click(screen.getByRole("button", { name: "문화·역사" }));
    expect(recommendation).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(recommendation);
    fireEvent.click(screen.getByRole("button", { name: "바다와 카페" }));
    expect(recommendation).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "바다와 카페" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "액티비티" }));
    expect(recommendation).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "AI에게 테마 맡기기" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "카페 투어 선택 해제" }));
    expect(recommendation).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "바다와 카페" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "맛집 탐방 선택 해제" }));
    expect(recommendation).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "문화·역사 선택 해제" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "맛집 탐방 선택 해제" })).not.toBeInTheDocument();
  });

  it("테마 세 개를 함께 선택하면 선택한 순서로 날짜마다 배치해 요청한다", async () => {
    const { onApply } = renderModal();
    const names = ["바다와 카페", "자연 속 쉼", "신나는 액티비티"];
    names.forEach((name) => fireEvent.click(screen.getByRole("button", { name })));

    names.forEach((name, index) => {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: `${index + 1}일차 테마 변경` })).toHaveTextContent(name);
    });
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["HEALING", "CAFE", "ACTIVITY"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].dayThemes).toEqual([
      { dayNumber: 1, themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"] },
      { dayNumber: 2, themes: ["HEALING"], tripIdeas: ["NATURE"] },
      { dayNumber: 3, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"] },
    ]);
  });

  it("추천 하나를 해제해도 함께 선택한 추천이 사용하는 기본 테마를 유지한다", async () => {
    const { onApply } = renderModal();
    ["바다와 카페", "자연 속 쉼", "신나는 액티비티"].forEach((name) => fireEvent.click(screen.getByRole("button", { name })));
    fireEvent.click(screen.getByRole("button", { name: "바다와 카페" }));

    expect(screen.getByRole("button", { name: "바다와 카페" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "자연 속 쉼" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "힐링·자연" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "카페 투어" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["HEALING", "ACTIVITY"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].dayThemes).toEqual([
      { dayNumber: 1, themes: ["HEALING"], tripIdeas: ["NATURE"] },
      { dayNumber: 2, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"] },
      { dayNumber: 3, themes: ["HEALING"], tripIdeas: ["NATURE"] },
    ]);
  });

  it("한 날짜에 테마를 추가하고 다른 날짜만 AI에 맡긴 결과로 요청과 전체 테마를 정한다", async () => {
    const { onApply } = renderModal();
    ["바다와 카페", "자연 속 쉼", "신나는 액티비티"].forEach((name) => fireEvent.click(screen.getByRole("button", { name })));
    fireEvent.click(screen.getByRole("button", { name: "1일차 테마 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "1일차 신나는 액티비티" }));
    expect(screen.getByRole("button", { name: "1일차 바다와 카페" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1일차 신나는 액티비티" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "2일차 테마 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "2일차 AI 추천" }));

    expect(screen.getByRole("button", { name: "1일차 테마 변경" })).toHaveTextContent("바다와 카페 · 신나는 액티비티");
    expect(screen.getByRole("button", { name: "2일차 테마 변경" })).toHaveTextContent("AI 추천");
    expect(screen.getByRole("button", { name: "3일차 테마 변경" })).toHaveTextContent("신나는 액티비티");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["HEALING", "CAFE", "ACTIVITY"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      themes: ["HEALING", "CAFE", "ACTIVITY"],
      dayThemes: [
        { dayNumber: 1, themes: ["HEALING", "CAFE", "ACTIVITY"], tripIdeas: ["COAST_CAFE", "ACTIVITY"] },
        { dayNumber: 2, themes: [], tripIdeas: [] },
        { dayNumber: 3, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"] },
      ],
    }));
  });

  it("당일 여행에 여러 추천을 골라도 모든 선택을 같은 날에 반영한다", async () => {
    const { props, rerender, onApply } = renderModal();
    rerender(<AiCourseModal {...props} endDate={props.startDate} />);
    ["바다와 카페", "자연 속 쉼", "신나는 액티비티"].forEach((name) => fireEvent.click(screen.getByRole("button", { name })));

    expect(screen.getByRole("button", { name: "1일차 테마 변경" })).toHaveTextContent("바다와 카페 · 자연 속 쉼 · 신나는 액티비티");
    expect(screen.queryByRole("button", { name: "2일차 테마 변경" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["HEALING", "CAFE", "ACTIVITY"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].dayThemes).toEqual([
      { dayNumber: 1, themes: ["HEALING", "CAFE", "ACTIVITY"], tripIdeas: ["COAST_CAFE", "NATURE", "ACTIVITY"] },
    ]);
  });

  it("유일하게 배치된 테마를 AI 추천으로 바꾸면 전체 요청과 저장 테마에서도 제외한다", async () => {
    const { onApply } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "바다와 카페" }));
    fireEvent.click(screen.getByRole("button", { name: "신나는 액티비티" }));
    fireEvent.click(screen.getByRole("button", { name: "2일차 테마 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "2일차 AI 추천" }));
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["HEALING", "CAFE"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      themes: ["HEALING", "CAFE"],
      dayThemes: [
        { dayNumber: 1, themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"] },
        { dayNumber: 2, themes: [], tripIdeas: [] },
        { dayNumber: 3, themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"] },
      ],
    }));
  });

  it("공유 기본 테마를 칩에서 제거하면 해당 추천들을 해제하고 나머지 취향을 유지한다", async () => {
    const { onApply } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "바다와 카페" }));
    fireEvent.click(screen.getByRole("button", { name: "자연 속 쉼" }));
    fireEvent.click(screen.getByRole("button", { name: "힐링·자연 선택 해제" }));

    expect(screen.getByRole("button", { name: "바다와 카페" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "자연 속 쉼" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "힐링·자연" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "카페 투어" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1일차 테마 변경" })).toHaveTextContent("카페 투어");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["CAFE"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].dayThemes).toEqual([
      { dayNumber: 1, themes: ["CAFE"], tripIdeas: [] },
      { dayNumber: 2, themes: ["CAFE"], tripIdeas: [] },
      { dayNumber: 3, themes: ["CAFE"], tripIdeas: [] },
    ]);
  });

  it("기간을 줄였다 늘리면 남은 날의 변경은 유지하고 삭제했던 날은 자동 배치한다", async () => {
    const { props, rerender, onApply } = renderModal();
    ["바다와 카페", "자연 속 쉼", "신나는 액티비티"].forEach((name) => fireEvent.click(screen.getByRole("button", { name })));
    fireEvent.click(screen.getByRole("button", { name: "1일차 테마 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "1일차 신나는 액티비티" }));
    fireEvent.click(screen.getByRole("button", { name: "3일차 테마 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "3일차 AI 추천" }));
    expect(screen.getByRole("button", { name: "3일차 테마 변경" })).toHaveTextContent("AI 추천");

    rerender(<AiCourseModal {...props} endDate="2026-09-15" />);
    expect(screen.queryByRole("button", { name: "3일차 테마 변경" })).not.toBeInTheDocument();
    rerender(<AiCourseModal {...props} />);
    expect(screen.getByRole("button", { name: "1일차 테마 변경" })).toHaveTextContent("바다와 카페 · 신나는 액티비티");
    expect(screen.getByRole("button", { name: "3일차 테마 변경" })).toHaveTextContent("신나는 액티비티");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalled());
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].dayThemes).toEqual([
      { dayNumber: 1, themes: ["HEALING", "CAFE", "ACTIVITY"], tripIdeas: ["COAST_CAFE", "ACTIVITY"] },
      { dayNumber: 2, themes: ["HEALING"], tripIdeas: ["NATURE"] },
      { dayNumber: 3, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"] },
    ]);
  });

  it("AI에게 테마를 맡겨도 지역과 동행, 꼭 갈 장소는 유지한다", async () => {
    vi.useFakeTimers();
    const { onApply } = renderModal();
    fireEvent.change(screen.getByRole("combobox", { name: "여행 지역" }), { target: { value: "강릉" } });
    fireEvent.click(screen.getByRole("button", { name: /취향 더 알려주기/ }));
    fireEvent.click(screen.getByRole("button", { name: "친구" }));
    fireEvent.change(screen.getByRole("textbox", { name: "고정할 장소 검색" }), { target: { value: "경포" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    fireEvent.click(screen.getByRole("button", { name: /경포해변/ }));
    fireEvent.click(screen.getByRole("button", { name: "바다와 카페" }));
    fireEvent.click(screen.getByRole("button", { name: "AI에게 테마 맡기기" }));

    expect(screen.getByRole("button", { name: "AI에게 테마 맡기기" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "바다와 카페" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "여행 지역" })).toHaveValue("강릉");
    expect(screen.getByRole("button", { name: "친구" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "경포해변 고정 해제" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    await act(async () => { await Promise.resolve(); });

    expect(onApply).toHaveBeenCalledWith(draft, []);
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      sigungu: sigunguCodeByRegion.강릉,
      companion: "FRIENDS",
      themes: [],
      anchorSpotIds: [101],
    }));
  });

  it("모달을 다시 열면 이전 추천 선택을 지우고 AI 자동 추천으로 시작한다", async () => {
    const { props, rerender, onApply } = renderModal();
    fireEvent.change(screen.getByRole("combobox", { name: "여행 지역" }), { target: { value: "강릉" } });
    fireEvent.click(screen.getByRole("button", { name: "바다와 카페" }));
    fireEvent.click(screen.getByRole("button", { name: "창 닫기" }));
    rerender(<AiCourseModal {...props} open={false} />);
    rerender(<AiCourseModal {...props} />);

    expect(screen.getByRole("button", { name: "AI에게 테마 맡기기" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "바다와 카페" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "여행 지역" })).toHaveValue("");
    expect(screen.getByRole("group", { name: "선택한 테마" })).toHaveTextContent("테마도 AI에게 맡겼어요.");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, []));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].sigungu).toBeUndefined();
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).not.toHaveProperty("dayThemes");
  });

  it("모달을 다시 연 뒤 같은 추천을 골라도 이전 날짜 변경을 복원하지 않는다", async () => {
    const { props, rerender, onApply } = renderModal();
    const selectIdeas = () => {
      fireEvent.click(screen.getByRole("button", { name: "바다와 카페" }));
      fireEvent.click(screen.getByRole("button", { name: "신나는 액티비티" }));
    };
    selectIdeas();
    fireEvent.click(screen.getByRole("button", { name: "1일차 테마 변경" }));
    fireEvent.click(screen.getByRole("button", { name: "1일차 AI 추천" }));
    fireEvent.click(screen.getByRole("button", { name: "창 닫기" }));
    rerender(<AiCourseModal {...props} open={false} />);
    rerender(<AiCourseModal {...props} />);
    expect(screen.queryByRole("button", { name: "1일차 테마 변경" })).not.toBeInTheDocument();

    selectIdeas();
    expect(screen.getByRole("button", { name: "1일차 테마 변경" })).toHaveTextContent("바다와 카페");
    expect(screen.getByRole("button", { name: "1일차 테마 변경" })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["HEALING", "CAFE", "ACTIVITY"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].dayThemes).toEqual([
      { dayNumber: 1, themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"] },
      { dayNumber: 2, themes: ["ACTIVITY"], tripIdeas: ["ACTIVITY"] },
      { dayNumber: 3, themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"] },
    ]);
  });

  it("여러 테마를 고른 뒤 여행지와 동행을 바꿔도 선택한 테마를 유지한다", async () => {
    const { onApply } = renderModal();
    const region = screen.getByRole("combobox", { name: "여행 지역" });

    fireEvent.change(region, { target: { value: "강릉" } });
    fireEvent.click(screen.getByRole("button", { name: "힐링·자연" }));
    fireEvent.click(screen.getByRole("button", { name: "카페 투어" }));
    expect(region).toHaveValue("강릉");
    fireEvent.change(region, { target: { value: "속초" } });
    fireEvent.click(screen.getByRole("button", { name: /취향 더 알려주기/ }));
    fireEvent.click(screen.getByRole("button", { name: "친구" }));
    expect(screen.getByRole("button", { name: "힐링·자연" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "카페 투어" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["HEALING", "CAFE"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      sigungu: sigunguCodeByRegion.속초,
      companion: "FRIENDS",
      themes: ["HEALING", "CAFE"],
    }));
  });

  it("선택한 테마 이름과 개수를 표시하고 칩에서 해제하면 카드와 요청에도 반영한다", async () => {
    const { onApply } = renderModal();
    const healing = screen.getByRole("button", { name: "힐링·자연" });
    const food = screen.getByRole("button", { name: "맛집 탐방" });
    const selection = screen.getByRole("group", { name: "선택한 테마" });

    expect(selection).toHaveTextContent("테마도 AI에게 맡겼어요.");
    fireEvent.click(healing);
    fireEvent.click(food);
    expect(selection).toHaveTextContent("2개");
    expect(selection).toHaveTextContent("힐링·자연");
    expect(selection).toHaveTextContent("맛집 탐방");
    const removeHealing = screen.getByRole("button", { name: "힐링·자연 선택 해제" });
    removeHealing.focus();
    fireEvent.click(removeHealing);
    expect(healing).toHaveAttribute("aria-pressed", "false");
    expect(healing).toHaveFocus();
    expect(food).toHaveAttribute("aria-pressed", "true");
    expect(selection).toHaveTextContent("1개");
    expect(screen.queryByRole("button", { name: "힐링·자연 선택 해제" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "맛집 탐방 선택 해제" }));
    expect(food).toHaveAttribute("aria-pressed", "false");
    expect(selection).toHaveTextContent("0개");
    expect(selection).toHaveTextContent("테마도 AI에게 맡겼어요.");
    expect(screen.getByRole("combobox", { name: "여행 지역" })).toHaveValue("");
    const submit = screen.getByRole("button", { name: "AI로 코스 만들기" });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, []));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].themes).toEqual([]);
  });

  it("선택 사항에서 검색한 장소를 필수 방문 장소로 전달한다", async () => {
    vi.useFakeTimers();
    const { onApply } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /취향 더 알려주기/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "고정할 장소 검색" }), {
      target: { value: "경포" },
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(searchSpots).toHaveBeenCalledWith(expect.objectContaining({ keyword: "경포", region: "51" }));
    fireEvent.click(screen.getByRole("button", { name: /경포해변/ }));
    expect(screen.getByRole("textbox", { name: "고정할 장소 검색" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "고정할 장소 검색" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    await act(async () => { await Promise.resolve(); });

    expect(onApply).toHaveBeenCalledWith(draft, []);
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0].anchorSpotIds).toEqual([101]);
  });

  it("생성 중 중복 요청을 막고 닫은 뒤 늦게 도착한 결과는 새 요청에 적용하지 않는다", async () => {
    const first = deferred<AiCourseDraft>();
    const second = deferred<AiCourseDraft>();
    vi.mocked(fetchAiCourseDraft).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { props, onApply, onClose, rerender } = renderModal();
    const submit = screen.getByRole("button", { name: "AI로 코스 만들기" });

    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(fetchAiCourseDraft).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "창 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<AiCourseModal {...props} open={false} />);
    rerender(<AiCourseModal {...props} />);
    const nextSubmit = screen.getByRole("button", { name: "AI로 코스 만들기" });
    fireEvent.click(nextSubmit);
    expect(fetchAiCourseDraft).toHaveBeenCalledTimes(2);

    await act(async () => { first.resolve(draft); });
    expect(onApply).not.toHaveBeenCalled();
    const createButtonDuringRequest = screen.getByRole("button", { name: "코스 짜는 중..." });
    expect(createButtonDuringRequest).toBeDisabled();
    fireEvent.click(createButtonDuringRequest);
    expect(fetchAiCourseDraft).toHaveBeenCalledTimes(2);

    const nextDraft = { ...draft, title: "새 여행 코스" };
    await act(async () => { second.resolve(nextDraft); });
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(nextDraft, []);
  });

  it("로그인 오류를 알리고 선택한 지역과 테마를 유지한 채 다시 시도한다", async () => {
    vi.mocked(fetchAiCourseDraft).mockRejectedValueOnce(new UnauthorizedError());
    const { onApply } = renderModal();

    fireEvent.change(screen.getByRole("combobox", { name: "여행 지역" }), { target: { value: "속초" } });
    fireEvent.click(screen.getByRole("button", { name: "힐링·자연" }));
    fireEvent.click(screen.getByRole("button", { name: "맛집 탐방" }));
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인이 필요한 기능이에요.");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "여행 지역" })).toHaveValue("속초");
    expect(screen.getByRole("button", { name: "힐링·자연" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "맛집 탐방" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft, ["HEALING", "FOOD"]));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[1][0]).toEqual(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]);
  });

  it("키보드 포커스를 모달 안에 유지하고 Escape로 닫는다", () => {
    const { onClose } = renderModal();
    const close = screen.getByRole("button", { name: "창 닫기" });
    const submit = screen.getByRole("button", { name: "AI로 코스 만들기" });

    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(submit).toHaveFocus();
    fireEvent.keyDown(submit, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
