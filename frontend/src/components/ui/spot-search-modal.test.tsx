import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import SpotSearchModal from "./spot-search-modal";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";
import * as spotService from "@/services/spots";

vi.mock("@/services/spots");
vi.mock("@/components/ui/kakao-map", () => ({
  default: ({ spots, viewportSpots }: {
    spots: Array<spotService.PopularSpot & { markerNumber?: number }>;
    viewportSpots?: spotService.PopularSpot[];
  }) => (
    <div
      data-testid="search-map"
      data-spot-ids={spots.map((spot) => spot.spotId).join(",")}
      data-marker-numbers={spots.map((spot) => spot.markerNumber).join(",")}
      data-viewport-spot-ids={viewportSpots?.map((spot) => spot.spotId).join(",")}
    />
  ),
}));

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly targets = new Set<Element>();
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? "0px";
    this.thresholds = Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0];
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) { this.targets.add(target); }
  unobserve(target: Element) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); }
  takeRecords() { return []; }

  emit(entries: Array<{ target: Element; isIntersecting: boolean; intersectionRatio?: number }>) {
    this.callback(entries.map(({ target, isIntersecting, intersectionRatio }) => ({
      target,
      isIntersecting,
      intersectionRatio: intersectionRatio ?? (isIntersecting ? 1 : 0),
      time: 0,
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRect: target.getBoundingClientRect(),
      rootBounds: null,
    })), this as unknown as IntersectionObserver);
  }
}

function observerFor(target: Element) {
  const observer = [...MockIntersectionObserver.instances].reverse().find((candidate) => candidate.targets.has(target));
  expect(observer).toBeDefined();
  return observer!;
}

async function triggerLoadMore(repetitions = 1) {
  const sentinel = await screen.findByTestId("spot-search-load-more");
  let observer!: MockIntersectionObserver;
  await waitFor(() => { observer = observerFor(sentinel); });
  expect(observer.root).toBe(screen.getByLabelText("장소 검색 결과"));
  await act(async () => {
    for (let index = 0; index < repetitions; index += 1) {
      observer.emit([{ target: sentinel, isIntersecting: true }]);
    }
  });
}

function showRows(visibleIds: number[]) {
  const rows = screen.getAllByTestId(/^spot-search-item-/);
  const observer = observerFor(rows[0]);
  expect(observer.root).toBe(screen.getByLabelText("장소 검색 결과"));
  act(() => observer.emit(rows.map((target) => ({
    target,
    isIntersecting: visibleIds.includes(Number(target.getAttribute("data-spot-id"))),
  }))));
}

const mockSpots: spotService.PopularSpot[] = [
  {
    spotId: 1,
    title: "경포해변",
    category: "관광지",
    region: "51",
    sigungu: "150",
    thumbnail: "http://example.com/beach.jpg",
  },
  {
    spotId: 2,
    title: "안목커피거리",
    category: "음식점",
    region: "51",
    sigungu: "150",
    thumbnail: null,
  },
];

const courseRegions = [
  { region: "51", sigungu: "150", label: "강릉시" },
  { region: "51", sigungu: "210", label: "속초시" },
];

const initialQuery = {
  region: "51",
  sigungu: undefined,
  category: undefined,
  sort: "popular",
  offset: 0,
  size: 20,
};

function result(
  items = mockSpots,
  offset = 0,
  totalCount = items.length,
): spotService.SpotListResponse {
  return { items, offset, size: 20, totalCount };
}

function makeSpots(start: number, count: number): spotService.PopularSpot[] {
  return Array.from({ length: count }, (_, index) => ({
    ...mockSpots[0],
    spotId: start + index,
    title: `장소 ${start + index}`,
  }));
}

function deferredResult() {
  let resolve!: (value: spotService.SpotListResponse) => void;
  const promise = new Promise<spotService.SpotListResponse>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function chooseRegion(label: string) {
  const select = screen.getByRole("combobox", { name: "검색 지역" });
  const option = within(select).getByRole("option", { name: label }) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
}

describe("SpotSearchModal", () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    excludedSpotIds: [],
    dayNumber: 2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    MockIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    (spotService.searchSpots as Mock).mockReset().mockResolvedValue(result());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("open=false 일 때는 렌더링되지 않고 검색하지 않는다", () => {
    render(<SpotSearchModal {...defaultProps} open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(spotService.searchSpots).not.toHaveBeenCalled();
  });

  it("Day 번호와 초기 인기 목록을 표시하고 강원도 안에서 검색한다", async () => {
    render(<SpotSearchModal {...defaultProps} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Day 2에 추가")).toBeInTheDocument();
    expect(await screen.findByText("경포해변")).toBeInTheDocument();
    expect(screen.getByText("안목커피거리")).toBeInTheDocument();
    expect(spotService.searchSpots).toHaveBeenCalledWith(initialQuery);
  });

  it("사진이 없거나 로딩에 실패한 검색 장소는 유사 사진과 작은 표시를 보여준다", async () => {
    render(<SpotSearchModal {...defaultProps} />);

    const missingPhoto = within(await screen.findByTestId("spot-search-item-2"));
    expect(missingPhoto.getByRole("img", { name: /안목커피거리 유사 이미지:/ })).toHaveAttribute("src", getSimilarSpotImage(mockSpots[1]).url);
    expect(missingPhoto.getByText("유사")).toBeInTheDocument();

    const originalPhoto = within(screen.getByTestId("spot-search-item-1"));
    expect(originalPhoto.getByRole("img", { name: "경포해변" })).toHaveAttribute("src", mockSpots[0].thumbnail);
    expect(originalPhoto.queryByText("유사")).not.toBeInTheDocument();
    fireEvent.error(originalPhoto.getByRole("img", { name: "경포해변" }));
    expect(originalPhoto.getByRole("img", { name: /경포해변 유사 이미지:/ })).toHaveAttribute("src", getSimilarSpotImage(mockSpots[0]).url);
    expect(originalPhoto.getByText("유사")).toBeInTheDocument();
  });

  it.each([{ regions: undefined }, { regions: [] }])("코스 지역이 $regions이면 강원 전체와 18개 시군을 제공한다", async ({ regions }) => {
    render(<SpotSearchModal {...defaultProps} regions={regions} />);

    const select = screen.getByRole("combobox", { name: "검색 지역" });
    expect(within(select).getAllByRole("option")).toHaveLength(19);
    expect(within(select).getByRole("option", { name: /강원.*전체/ })).toHaveProperty("selected", true);
    expect(within(select).getByRole("option", { name: "강원 강릉" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "강원 양양" })).toBeInTheDocument();
    await waitFor(() => expect(spotService.searchSpots).toHaveBeenCalledWith(initialQuery));
  });

  it("지역이 하나인 코스는 해당 지역으로 고정하고 목록과 지도를 함께 조회한다", async () => {
    render(<SpotSearchModal {...defaultProps} regions={[courseRegions[0]]} />);

    expect(await screen.findByText("경포해변")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "검색 지역" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/강릉시/).length).toBeGreaterThan(0);
    expect(spotService.searchSpots).toHaveBeenCalledWith({ ...initialQuery, sigungu: "150" });
    expect(screen.getByTestId("search-map")).toHaveAttribute("data-spot-ids", "1,2");
  });

  it("여러 지역인 코스에서는 코스 지역만 선택할 수 있다", async () => {
    render(<SpotSearchModal {...defaultProps} regions={courseRegions} />);

    const options = within(screen.getByRole("combobox", { name: "검색 지역" })).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["강릉시", "속초시"]);
    await waitFor(() =>
      expect(spotService.searchSpots).toHaveBeenCalledWith({ ...initialQuery, sigungu: "150" }),
    );
    chooseRegion("속초시");
    await waitFor(() =>
      expect(spotService.searchSpots).toHaveBeenLastCalledWith({ ...initialQuery, sigungu: "210" }),
    );
  });

  it("검색어 입력 시 300ms 디바운스 후 해당 지역 안에서 keyword로 검색한다", async () => {
    vi.useFakeTimers();

    try {
      render(<SpotSearchModal {...defaultProps} regions={[courseRegions[0]]} />);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "커피" } });

      expect(spotService.searchSpots).not.toHaveBeenCalledWith(expect.objectContaining({ keyword: "커피" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      expect(spotService.searchSpots).toHaveBeenLastCalledWith({
        keyword: "커피",
        region: "51",
        sigungu: "150",
        category: undefined,
        offset: 0,
        size: 20,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("목록 끝으로 스크롤하면 20개 이후 장소를 자동으로 불러와 선택할 수 있다", async () => {
    const firstPage = makeSpots(1, 20);
    const lastSpot = makeSpots(21, 1)[0];
    (spotService.searchSpots as Mock)
      .mockResolvedValueOnce(result(firstPage, 0, 21))
      .mockResolvedValueOnce(result([lastSpot], 20, 21));
    render(<SpotSearchModal {...defaultProps} regions={[courseRegions[0]]} />);

    await screen.findByText("장소 20");
    expect(screen.getByText("전체 21개")).toBeInTheDocument();
    expect(screen.getByText("21개 중 20개 표시")).toBeInTheDocument();
    expect(screen.getByText("아래로 스크롤하면 장소를 더 불러옵니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "장소 더 보기" })).not.toBeInTheDocument();
    await triggerLoadMore();
    expect(await screen.findByText("장소 21")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^spot-search-item-/)).toHaveLength(21);
    expect(screen.getByText("21개 중 21개 표시")).toBeInTheDocument();
    expect(screen.queryByText("아래로 스크롤하면 장소를 더 불러옵니다.")).not.toBeInTheDocument();
    expect(spotService.searchSpots).toHaveBeenLastCalledWith({
      ...initialQuery,
      sigungu: "150",
      offset: 20,
    });
    expect(screen.getByTestId("search-map")).toHaveAttribute(
      "data-viewport-spot-ids",
      [...firstPage, lastSpot].map((spot) => spot.spotId).join(","),
    );
    showRows([19, 20, 21]);
    await waitFor(() => expect(screen.getByTestId("search-map")).toHaveAttribute("data-spot-ids", "19,20,21"));
    fireEvent.click(within(screen.getByTestId("spot-search-item-21")).getByRole("button", { name: "선택" }));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(lastSpot);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("중복 장소는 합치고 실제로 받은 항목 수만큼 다음 offset을 진행한다", async () => {
    (spotService.searchSpots as Mock)
      .mockResolvedValueOnce(result(makeSpots(1, 20), 0, 24))
      .mockResolvedValueOnce(result(makeSpots(20, 3), 20, 24))
      .mockResolvedValueOnce(result(makeSpots(23, 1), 23, 24));
    render(<SpotSearchModal {...defaultProps} />);

    await triggerLoadMore();
    await screen.findByText("장소 22");
    expect(screen.getAllByTestId(/^spot-search-item-/)).toHaveLength(22);
    expect(screen.getAllByTestId("spot-search-item-20")).toHaveLength(1);
    await triggerLoadMore();
    await screen.findByText("장소 23");
    expect(spotService.searchSpots).toHaveBeenLastCalledWith({ ...initialQuery, offset: 23 });
    expect(screen.queryByText("아래로 스크롤하면 장소를 더 불러옵니다.")).not.toBeInTheDocument();
  });

  it("하단 교차 이벤트가 반복되거나 요청 중 다시 스크롤해도 한 번만 불러온다", async () => {
    const secondPage = deferredResult();
    (spotService.searchSpots as Mock)
      .mockResolvedValueOnce(result(makeSpots(1, 20), 0, 21))
      .mockReturnValueOnce(secondPage.promise);
    render(<SpotSearchModal {...defaultProps} />);
    await screen.findByText("장소 20");
    const list = screen.getByLabelText("장소 검색 결과");
    Object.defineProperties(list, {
      scrollHeight: { configurable: true, value: 2000 },
      clientHeight: { configurable: true, value: 400 },
    });
    fireEvent.scroll(list, { target: { scrollTop: 100 } });
    expect(spotService.searchSpots).toHaveBeenCalledTimes(1);

    await triggerLoadMore(3);
    expect(spotService.searchSpots).toHaveBeenCalledTimes(2);
    expect(screen.getByText("장소 1")).toBeInTheDocument();
    fireEvent.scroll(list, { target: { scrollTop: 1600 } });
    fireEvent.scroll(list, { target: { scrollTop: 1600 } });
    expect(spotService.searchSpots).toHaveBeenCalledTimes(2);
    await act(async () => secondPage.resolve(result(makeSpots(21, 1), 20, 21)));
    fireEvent.scroll(list, { target: { scrollTop: 1600 } });
    expect(spotService.searchSpots).toHaveBeenCalledTimes(2);
  });

  it("현재 보이는 행만 150ms 후 지도에 표시하고 전체 목록의 마커 번호와 지도 범위를 유지한다", async () => {
    const spots = makeSpots(1, 20);
    (spotService.searchSpots as Mock).mockResolvedValue(result(spots));
    render(<SpotSearchModal {...defaultProps} />);
    await screen.findByText("장소 20");
    const map = screen.getByTestId("search-map");
    expect(map).toHaveAttribute("data-spot-ids", "1,2,3,4,5");
    expect(map).toHaveAttribute("data-viewport-spot-ids", spots.map((spot) => spot.spotId).join(","));

    vi.useFakeTimers();
    showRows([6, 7, 8, 9, 10]);
    await act(async () => { await vi.advanceTimersByTimeAsync(149); });
    expect(map).toHaveAttribute("data-spot-ids", "1,2,3,4,5");
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(map).toHaveAttribute("data-spot-ids", "6,7,8,9,10");
    expect(map).toHaveAttribute("data-marker-numbers", "6,7,8,9,10");

    const edgeRow = screen.getByTestId("spot-search-item-5");
    const rowObserver = observerFor(edgeRow);
    expect(rowObserver.thresholds).toEqual([0.01]);
    act(() => rowObserver.emit([{ target: edgeRow, isIntersecting: true, intersectionRatio: 0 }]));
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(map).toHaveAttribute("data-spot-ids", "6,7,8,9,10");

    showRows([8, 9, 10, 11, 12]);
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(map).toHaveAttribute("data-spot-ids", "8,9,10,11,12");
    expect(map).toHaveAttribute("data-marker-numbers", "8,9,10,11,12");
    expect(map).toHaveAttribute("data-viewport-spot-ids", spots.map((spot) => spot.spotId).join(","));

    showRows([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(map).toHaveAttribute("data-spot-ids", "");
    expect(map).toHaveAttribute("data-viewport-spot-ids", spots.map((spot) => spot.spotId).join(","));
  });

  it("검색어를 입력하는 동안 이전 검색의 다음 페이지를 자동으로 요청하지 않는다", async () => {
    (spotService.searchSpots as Mock)
      .mockResolvedValueOnce(result(makeSpots(1, 20), 0, 40))
      .mockResolvedValueOnce(result([mockSpots[1]]));
    render(<SpotSearchModal {...defaultProps} regions={[courseRegions[0]]} />);
    await screen.findByText("장소 20");
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "커피" } });
    fireEvent.scroll(screen.getByLabelText("장소 검색 결과"));
    expect(spotService.searchSpots).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(spotService.searchSpots).toHaveBeenCalledTimes(2);
    expect(spotService.searchSpots).toHaveBeenLastCalledWith(expect.objectContaining({
      keyword: "커피",
      sigungu: "150",
      offset: 0,
    }));
    expect(screen.getByTestId("search-map")).toHaveAttribute("data-spot-ids", "2");
  });

  it("다음 페이지가 실패해도 기존 목록을 유지하고 같은 offset에서 다시 시도한다", async () => {
    const secondPage = deferredResult();
    (spotService.searchSpots as Mock)
      .mockResolvedValueOnce(result(mockSpots, 0, 3))
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockReturnValueOnce(secondPage.promise);
    render(<SpotSearchModal {...defaultProps} />);

    await triggerLoadMore();
    expect(await screen.findByText("네트워크 오류")).toBeInTheDocument();
    expect(screen.getByText("경포해변")).toBeInTheDocument();
    expect(screen.getByTestId("search-map")).toHaveAttribute("data-spot-ids", "1,2");
    fireEvent.scroll(screen.getByLabelText("장소 검색 결과"));
    expect(spotService.searchSpots).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(spotService.searchSpots).toHaveBeenLastCalledWith({ ...initialQuery, offset: 2 });
    expect(screen.getByText("경포해변")).toBeInTheDocument();
    expect(screen.getByText("장소를 불러오는 중...")).toBeInTheDocument();
    fireEvent.scroll(screen.getByLabelText("장소 검색 결과"));
    expect(spotService.searchSpots).toHaveBeenCalledTimes(3);

    await act(async () => secondPage.resolve(result(makeSpots(3, 1), 2, 3)));
    expect(await screen.findByText("장소 3")).toBeInTheDocument();
    expect(screen.queryByText("네트워크 오류")).not.toBeInTheDocument();
    expect(screen.queryByText("아래로 스크롤하면 장소를 더 불러옵니다.")).not.toBeInTheDocument();
  });

  it("카테고리를 바꾸면 누적 페이지를 비우고 지역은 유지한다", async () => {
    const filtered = deferredResult();
    (spotService.searchSpots as Mock)
      .mockResolvedValueOnce(result(mockSpots, 0, 3))
      .mockResolvedValueOnce(result(makeSpots(3, 1), 2, 3))
      .mockReturnValueOnce(filtered.promise);
    render(<SpotSearchModal {...defaultProps} regions={[courseRegions[0]]} />);

    await triggerLoadMore();
    await screen.findByText("장소 3");
    showRows([3]);
    await waitFor(() => expect(screen.getByTestId("search-map")).toHaveAttribute("data-spot-ids", "3"));
    fireEvent.click(screen.getByRole("button", { name: "음식점" }));
    expect(spotService.searchSpots).toHaveBeenLastCalledWith({
      ...initialQuery,
      sigungu: "150",
      category: "음식점",
    });
    expect(screen.queryByText("경포해변")).not.toBeInTheDocument();
    expect(screen.queryByText("장소 3")).not.toBeInTheDocument();
    expect(screen.getByTestId("search-map")).toHaveAttribute("data-spot-ids", "");
    await act(async () => filtered.resolve(result([mockSpots[1]])));
    expect(await screen.findByText("안목커피거리")).toBeInTheDocument();
    expect(screen.getByTestId("search-map")).toHaveAttribute("data-spot-ids", "2");
    expect(screen.getByTestId("search-map")).toHaveAttribute("data-marker-numbers", "1");
    expect(screen.getByTestId("search-map")).toHaveAttribute("data-viewport-spot-ids", "2");
    expect(screen.queryByText("아래로 스크롤하면 장소를 더 불러옵니다.")).not.toBeInTheDocument();
  });

  it.each(["지역", "검색어"])("%s 변경 전에 요청한 추가 페이지가 늦게 도착해도 새 검색에 섞이지 않는다", async (filter) => {
    const stalePage = deferredResult();
    const replacement = { ...makeSpots(30, 1)[0], sigungu: filter === "지역" ? "210" : "150" };
    (spotService.searchSpots as Mock)
      .mockResolvedValueOnce(result(mockSpots, 0, 3))
      .mockReturnValueOnce(stalePage.promise)
      .mockResolvedValueOnce(result([replacement]));
    render(<SpotSearchModal {...defaultProps} regions={courseRegions} />);

    await triggerLoadMore();
    if (filter === "지역") {
      chooseRegion("속초시");
    } else {
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "바다" } });
    }
    await screen.findByText("장소 30");
    expect(spotService.searchSpots).toHaveBeenLastCalledWith(expect.objectContaining({
      region: "51",
      sigungu: filter === "지역" ? "210" : "150",
      offset: 0,
      ...(filter === "검색어" ? { keyword: "바다" } : {}),
    }));
    await act(async () => stalePage.resolve(result(makeSpots(3, 1), 2, 3)));
    expect(screen.queryByText("장소 3")).not.toBeInTheDocument();
    expect(screen.queryByText("경포해변")).not.toBeInTheDocument();
    expect(screen.getByText("장소 30")).toBeInTheDocument();
    expect(screen.getByTestId("search-map")).toHaveAttribute("data-spot-ids", "30");
  });

  it("닫았다 다시 열면 검색어와 카테고리, 지역과 페이지를 초기화한다", async () => {
    const { rerender } = render(<SpotSearchModal {...defaultProps} regions={courseRegions} />);
    await screen.findByText("경포해변");
    chooseRegion("속초시");
    fireEvent.click(screen.getByRole("button", { name: "음식점" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "커피" } });
    await waitFor(() => expect(spotService.searchSpots).toHaveBeenLastCalledWith(expect.objectContaining({
      keyword: "커피",
      sigungu: "210",
      category: "음식점",
    })));
    rerender(<SpotSearchModal {...defaultProps} regions={courseRegions} open={false} />);
    rerender(<SpotSearchModal {...defaultProps} regions={courseRegions} />);

    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(spotService.searchSpots).toHaveBeenLastCalledWith({ ...initialQuery, sigungu: "150" }),
    );
    expect(screen.getByRole("option", { name: "강릉시" })).toHaveProperty("selected", true);
  });

  it("장소 선택 버튼을 누르면 onSelect와 onClose가 호출된다", async () => {
    render(<SpotSearchModal {...defaultProps} />);
    await screen.findByText("경포해변");
    fireEvent.click(screen.getAllByRole("button", { name: "선택" })[0]);
    expect(defaultProps.onSelect).toHaveBeenCalledWith(mockSpots[0]);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it("이미 추가한 장소는 선택 버튼이 비활성화되어 다시 선택할 수 없다", async () => {
    render(<SpotSearchModal {...defaultProps} excludedSpotIds={[1]} />);
    await screen.findByText("경포해변");
    expect(screen.queryByText("담김")).not.toBeInTheDocument();
    const selectedButton = within(screen.getByTestId("spot-search-item-1")).getByRole("button", { name: "선택" });
    expect(selectedButton).toBeDisabled();
    expect(within(screen.getByTestId("spot-search-item-2")).getByRole("button", { name: "선택" })).toBeEnabled();
    fireEvent.click(selectedButton);
    expect(defaultProps.onSelect).not.toHaveBeenCalled();
    expect(defaultProps.onClose).not.toHaveBeenCalled();
  });

  it("Escape 키나 배경 클릭 시 onClose가 호출된다", () => {
    render(<SpotSearchModal {...defaultProps} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByTestId("spot-search-backdrop"));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(2);
  });

  it("첫 검색이 실패하면 다시 시도해 목록을 불러올 수 있다", async () => {
    (spotService.searchSpots as Mock)
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValueOnce(result());
    render(<SpotSearchModal {...defaultProps} />);
    expect(await screen.findByText("네트워크 오류")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("경포해변")).toBeInTheDocument();
    expect(spotService.searchSpots).toHaveBeenLastCalledWith(initialQuery);
  });
});
