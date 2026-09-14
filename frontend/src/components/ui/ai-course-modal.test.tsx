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

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft));
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
  });

  it.each([
    { name: "강릉 바다와 카페", region: "강릉" as const, themes: ["HEALING", "CAFE"] },
    { name: "속초 맛집과 산책", region: "속초" as const, themes: ["HEALING", "FOOD"] },
    { name: "춘천 자연 속 쉼", region: "춘천" as const, themes: ["HEALING"] },
  ])("'$name' 추천으로 여행지와 취향을 한 번에 적용한다", async ({ name, region, themes }) => {
    const { onApply } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(name) }));
    expect(screen.getByRole("combobox", { name: "여행 지역" })).toHaveValue(region);
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      sigungu: sigunguCodeByRegion[region],
      themes,
    }));
  });

  it("추천을 고른 뒤 여행지와 동행, 테마를 직접 조정할 수 있다", async () => {
    const { onApply } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /강릉 바다와 카페/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "여행 지역" }), { target: { value: "속초" } });
    fireEvent.click(screen.getByRole("button", { name: /취향 더 알려주기/ }));
    fireEvent.click(screen.getByRole("button", { name: "친구" }));
    fireEvent.click(screen.getByRole("button", { name: "카페 투어" }));
    fireEvent.click(screen.getByRole("button", { name: "맛집 탐방" }));
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft));
    expect(vi.mocked(fetchAiCourseDraft).mock.calls[0][0]).toEqual(expect.objectContaining({
      sigungu: sigunguCodeByRegion.속초,
      companion: "FRIENDS",
      themes: ["HEALING", "FOOD"],
    }));
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

    expect(onApply).toHaveBeenCalledWith(draft);
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
    expect(onApply).toHaveBeenCalledWith(nextDraft);
  });

  it("로그인 오류를 알리고 선택한 추천을 유지한 채 다시 시도한다", async () => {
    vi.mocked(fetchAiCourseDraft).mockRejectedValueOnce(new UnauthorizedError());
    const { onApply } = renderModal();

    fireEvent.click(screen.getByRole("button", { name: /속초 맛집과 산책/ }));
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("로그인이 필요한 기능이에요.");
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "여행 지역" })).toHaveValue("속초");
    fireEvent.click(screen.getByRole("button", { name: "AI로 코스 만들기" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledWith(draft));
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
