import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import CourseRouteMap from "@/components/ui/course-route-map";
import { FALLBACK_SPOT_IMAGE } from "@/components/ui/spot-image";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";
import type { CourseDay, CourseSpotSummary } from "@/services/course";

type MapSpot = {
  spotId: number;
  title: string;
  latitude?: number | null;
  longitude?: number | null;
  markerNumber?: number;
};

type MapProps = {
  spots: MapSpot[];
  highlightedSpotId?: number | null;
  focusedSpotId?: number | null;
  focusRequestId?: number;
  onSpotClick?: (spot: MapSpot) => void;
};

const { renderMap } = vi.hoisted(() => ({ renderMap: vi.fn<(props: MapProps) => void>() }));

vi.mock("@/components/ui/kakao-map", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/ui/kakao-map")>(),
  default: (props: MapProps) => {
    renderMap(props);
    return (
      <div role="region" aria-label="테스트 지도">
        {props.spots.map((spot) => (
          <button
            key={spot.spotId}
            type="button"
            aria-label={`지도 마커: ${spot.title}`}
            onClick={() => props.onSpotClick?.(spot)}
          >
            {spot.markerNumber}
          </button>
        ))}
      </div>
    );
  },
}));

const beach: CourseSpotSummary = {
  spotId: 101,
  sequence: 0,
  title: "경포해변",
  category: "관광지",
  region: "51",
  sigungu: "150",
  address: "강원특별자치도 강릉시 안현동",
  thumbnail: "https://images.example/beach.jpg",
  latitude: 37.8055,
  longitude: 128.9076,
  memo: "바다 산책",
};

const cafe: CourseSpotSummary = {
  ...beach,
  spotId: 102,
  sequence: 1,
  title: "안목 / 커피거리",
  address: "강원특별자치도 강릉시 창해로 14번길",
  thumbnail: "https://images.example/cafe.jpg",
  latitude: 37.7722,
  longitude: 128.9484,
  memo: null,
};

const market: CourseSpotSummary = {
  ...beach,
  spotId: 201,
  title: "강릉중앙시장",
  address: "강원특별자치도 강릉시 금성로 21",
  latitude: 37.7531,
  longitude: 128.8988,
};

const days: CourseDay[] = [
  { dayNumber: 1, spots: [beach, cafe] },
  { dayNumber: 2, spots: [market] },
  { dayNumber: 3, spots: [] },
];

function renderRoute(routeDays = days) {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CourseRouteMap days={routeDays} startDate="2026-09-12" />
    </MemoryRouter>,
  );
}

function latestMapProps() {
  return renderMap.mock.calls[renderMap.mock.calls.length - 1][0];
}

describe("CourseRouteMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("처음에는 Day 1의 장소만 표시하고 첫 장소를 선택한다", () => {
    renderRoute();

    expect(screen.getByRole("tablist", { name: "여행 일차" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Day 1" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Day 2" })).toHaveAttribute("aria-selected", "false");
    const panel = within(screen.getByRole("tabpanel"));
    expect(panel.getByRole("button", { name: "경포해변 지도에서 보기" })).toHaveAttribute("aria-pressed", "true");
    expect(panel.getByRole("button", { name: "안목 / 커피거리 지도에서 보기" })).toHaveAttribute("aria-pressed", "false");
    expect(panel.queryByRole("button", { name: "강릉중앙시장 지도에서 보기" })).not.toBeInTheDocument();
    expect(latestMapProps().highlightedSpotId).toBe(beach.spotId);
    expect(latestMapProps().spots.map((spot) => spot.spotId)).toEqual([101, 102]);
  });

  test("일차를 바꾸면 지도와 장소 목록을 함께 바꾸고 해당 일차의 첫 장소를 선택한다", () => {
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "안목 / 커피거리 지도에서 보기" }));
    fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));

    expect(screen.getByRole("tab", { name: "Day 2" })).toHaveAttribute("aria-selected", "true");
    const panel = within(screen.getByRole("tabpanel"));
    expect(panel.queryByRole("button", { name: "경포해변 지도에서 보기" })).not.toBeInTheDocument();
    expect(panel.getByRole("button", { name: "강릉중앙시장 지도에서 보기" })).toHaveAttribute("aria-pressed", "true");
    expect(latestMapProps().spots.map((spot) => spot.spotId)).toEqual([201]);
    expect(latestMapProps().highlightedSpotId).toBe(market.spotId);
    expect(within(screen.getByRole("region", { name: "선택한 장소" })).getByRole("link", { name: "장소 상세보기" })).toHaveAttribute("href", "/spots/201");
  });

  test("지도 마커를 누르면 해당 장소의 사진, 주소와 상세보기 및 길찾기 링크를 보여준다", () => {
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "지도 마커: 안목 / 커피거리" }));

    const selected = within(screen.getByRole("region", { name: "선택한 장소" }));
    expect(selected.getByText(cafe.title)).toBeInTheDocument();
    expect(selected.getByText(cafe.address!)).toBeInTheDocument();
    expect(selected.getByRole("img", { name: cafe.title })).toHaveAttribute("src", cafe.thumbnail);
    expect(selected.getByRole("link", { name: "장소 상세보기" })).toHaveAttribute("href", "/spots/102");
    const directions = selected.getByRole("link", { name: /길찾기/ });
    expect(directions).toHaveAttribute("href", `https://map.kakao.com/link/to/${encodeURIComponent(cafe.title)},${cafe.latitude},${cafe.longitude}`);
    expect(directions).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "안목 / 커피거리 지도에서 보기" })).toHaveAttribute("aria-pressed", "true");
  });

  test("장소 목록을 누르면 지도 강조와 중심 이동 대상도 같은 장소로 바뀐다", () => {
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "안목 / 커피거리 지도에서 보기" }));

    expect(latestMapProps().highlightedSpotId).toBe(cafe.spotId);
    expect(latestMapProps().focusedSpotId).toBe(cafe.spotId);
    const firstRequestId = latestMapProps().focusRequestId;
    fireEvent.click(screen.getByRole("button", { name: "안목 / 커피거리 지도에서 보기" }));
    expect(latestMapProps().focusedSpotId).toBe(cafe.spotId);
    expect(latestMapProps().focusRequestId).toBe(firstRequestId! + 1);
    expect(screen.getByRole("button", { name: "경포해변 지도에서 보기" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "안목 / 커피거리 지도에서 보기" })).toHaveAttribute("aria-pressed", "true");
  });

  test("사진과 주소가 누락된 장소도 유사 이미지와 안내를 보여주며 지도 선택을 유지한다", () => {
    renderRoute([{ dayNumber: 1, spots: [{ ...beach, thumbnail: "  ", address: "  " }, cafe] }]);

    const selected = within(screen.getByRole("region", { name: "선택한 장소" }));
    expect(selected.getByRole("img", { name: /경포해변 유사 이미지:/ })).toHaveAttribute("src", getSimilarSpotImage(beach).url);
    expect(selected.getByText("유사 이미지")).toBeInTheDocument();
    const listItem = within(screen.getByRole("button", { name: "경포해변 지도에서 보기" }));
    expect(listItem.getByRole("img")).toHaveAttribute("src", getSimilarSpotImage(beach).url);
    expect(listItem.getByText("유사")).toBeInTheDocument();
    expect(selected.getByText("주소 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: "경포해변 지도에서 보기" })).getByText("주소 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
    expect(latestMapProps().highlightedSpotId).toBe(beach.spotId);

    fireEvent.click(screen.getByRole("button", { name: "안목 / 커피거리 지도에서 보기" }));
    expect(selected.getByRole("img", { name: cafe.title })).toHaveAttribute("src", cafe.thumbnail);
    expect(latestMapProps().focusedSpotId).toBe(cafe.spotId);
  });

  test("지도에서 선택한 장소의 사진 로딩이 실패하면 유사 이미지로 대체하고 유사 이미지도 실패할 때 기본 그림을 표시한다", () => {
    renderRoute();
    const selected = within(screen.getByRole("region", { name: "선택한 장소" }));
    fireEvent.error(selected.getByRole("img", { name: beach.title }));
    expect(selected.getByRole("img", { name: /경포해변 유사 이미지:/ })).toHaveAttribute("src", getSimilarSpotImage(beach).url);
    fireEvent.error(selected.getByRole("img", { name: /경포해변 유사 이미지:/ }));
    expect(selected.getByRole("img", { name: beach.title })).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
    expect(selected.getByRole("link", { name: /길찾기/ })).toBeInTheDocument();
  });

  test("장소 이름과 분류가 누락되어도 기본 여행 장소 분류의 유사 사진을 표시한다", () => {
    const unnamed = { ...beach, title: "", category: "", thumbnail: null };
    renderRoute([{ dayNumber: 1, spots: [unnamed] }]);

    const selected = within(screen.getByRole("region", { name: "선택한 장소" }));
    expect(selected.getByRole("img", { name: /여행 장소 유사 이미지:/ })).toHaveAttribute(
      "src",
      getSimilarSpotImage({ ...unnamed, title: "여행 장소", category: "관광지" }).url,
    );
  });

  test("좌표 없는 장소가 앞에 있어도 첫 유효 장소를 선택하며 방문 순서 번호를 보존한다", () => {
    const unavailable = { ...beach, latitude: null, longitude: null };
    const third = { ...market, sequence: 2 };
    renderRoute([{ dayNumber: 1, spots: [third, unavailable, cafe] }]);

    expect(screen.getByRole("button", { name: "경포해변 지도에서 보기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "안목 / 커피거리 지도에서 보기" })).toHaveAttribute("aria-pressed", "true");
    expect(latestMapProps().highlightedSpotId).toBe(cafe.spotId);
    expect(latestMapProps().spots.find((spot) => spot.spotId === cafe.spotId)?.markerNumber).toBe(2);
    expect(latestMapProps().spots.find((spot) => spot.spotId === market.spotId)?.markerNumber).toBe(3);
    expect(within(screen.getByRole("tabpanel")).getAllByRole("button", { name: /지도에서 보기$/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "경포해변 지도에서 보기",
      "안목 / 커피거리 지도에서 보기",
      "강릉중앙시장 지도에서 보기",
    ]);
  });

  test.each([
    { label: "누락된 좌표", latitude: null, longitude: null },
    { label: "0 좌표", latitude: 0, longitude: 0 },
    { label: "서비스 범위 밖 좌표", latitude: 48.8566, longitude: 2.3522 },
    { label: "유한하지 않은 좌표", latitude: Number.NaN, longitude: 128.9 },
  ])("$label 장소는 목록과 상세 링크를 유지하되 길찾기를 제공하지 않는다", ({ latitude, longitude }) => {
    renderRoute([{ dayNumber: 1, spots: [{ ...beach, latitude, longitude }] }]);

    expect(screen.getByRole("button", { name: "경포해변 지도에서 보기" })).toHaveAttribute("aria-pressed", "true");
    const selected = within(screen.getByRole("region", { name: "선택한 장소" }));
    expect(selected.getByRole("link", { name: "장소 상세보기" })).toHaveAttribute("href", "/spots/101");
    expect(selected.queryByRole("link", { name: /길찾기/ })).not.toBeInTheDocument();
  });

  test("빈 일차로 전환하면 이전 장소 대신 빈 일정 안내를 보여준다", () => {
    renderRoute();
    fireEvent.click(screen.getByRole("tab", { name: "Day 3" }));

    const panel = within(screen.getByRole("tabpanel"));
    expect(panel.getByText("아직 계획이 없어요.")).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: /지도에서 보기$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "선택한 장소" })).not.toBeInTheDocument();
  });

  test("화살표와 Home/End 키로 일차 탭의 포커스와 선택을 함께 옮긴다", () => {
    renderRoute();
    const first = screen.getByRole("tab", { name: "Day 1" });
    const second = screen.getByRole("tab", { name: "Day 2" });
    const last = screen.getByRole("tab", { name: "Day 3" });
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(second, { key: "End" });
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(last).toHaveFocus();
    expect(last).toHaveAttribute("aria-selected", "true");
  });
});
