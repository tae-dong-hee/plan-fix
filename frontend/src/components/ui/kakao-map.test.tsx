import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import KakaoMap, { type KakaoMapSpot } from "@/components/ui/kakao-map";
import { hasMapCoordinates } from "@/lib/map-coordinates";

const spots: KakaoMapSpot[] = [
  { spotId: 1, title: "경포해변", latitude: 37.8, longitude: 128.9 },
  { spotId: 2, title: "정동진", latitude: 37.6, longitude: 129.0 },
];

type ScreenPoint = { x: number; y: number };
type SdkMockOptions = {
  viewport?: { width: number; height: number };
  points?: ScreenPoint[];
  labelWidths?: number[];
  fittedLevel?: number;
};

function installSdkMock({ viewport, points, labelWidths, fittedLevel = 9 }: SdkMockOptions = {}) {
  class LatLng {
    constructor(public latitude: number, public longitude: number) {}
  }
  const event = {
    addListener: vi.fn((map: MockMap, name: string, callback: () => void) => {
      const listeners = map.listeners.get(name) ?? new Set<() => void>();
      listeners.add(callback);
      map.listeners.set(name, listeners);
    }),
    removeListener: vi.fn((map: MockMap, name: string, callback: () => void) => {
      map.listeners.get(name)?.delete(callback);
    }),
    trigger: (map: MockMap, name: string) => map.listeners.get(name)?.forEach((callback) => callback()),
  };
  const maps: MockMap[] = [];
  class MockMap {
    listeners = new Map<string, Set<() => void>>();
    level = fittedLevel;
    offset = { x: 0, y: 0 };
    positions: LatLng[] = [];
    setBounds = vi.fn((bounds: LatLngBounds) => {
      this.positions = bounds.positions;
      this.level = fittedLevel;
      this.offset = { x: 0, y: 0 };
      event.trigger(this, "bounds_changed");
    });
    getLevel = vi.fn(() => this.level);
    setLevel = vi.fn((level: number) => {
      this.level = level;
      event.trigger(this, "zoom_changed");
      event.trigger(this, "bounds_changed");
      event.trigger(this, "idle");
    });
    panTo = vi.fn((position: LatLng) => {
      const point = this.projection.containerPointFromCoords(position);
      this.offset.x += (viewport?.width ?? 0) / 2 - point.x;
      this.offset.y += (viewport?.height ?? 0) / 2 - point.y;
      event.trigger(this, "bounds_changed");
      event.trigger(this, "idle");
    });
    projection = {
      containerPointFromCoords: vi.fn((position: LatLng) => {
        const index = this.positions.findIndex((point) => point === position);
        const point = points?.[index] ?? { x: position.longitude, y: position.latitude };
        const scale = 2 ** (fittedLevel - this.level);
        const center = { x: (viewport?.width ?? 0) / 2, y: (viewport?.height ?? 0) / 2 };
        return {
          x: center.x + (point.x - center.x) * scale + this.offset.x,
          y: center.y + (point.y - center.y) * scale + this.offset.y,
        };
      }),
    };
    getProjection = vi.fn(() => this.projection);
    relayout = vi.fn();
    constructor(public container: HTMLElement) {
      if (viewport) {
        Object.defineProperties(container, {
          clientWidth: { configurable: true, value: viewport.width },
          clientHeight: { configurable: true, value: viewport.height },
        });
      }
      maps.push(this);
    }
  }
  const overlays: CustomOverlay[] = [];
  class CustomOverlay {
    setZIndex = vi.fn();
    setMap = vi.fn((map: MockMap | null) => {
      if (map) map.container.appendChild(this.options.content);
      else this.options.content.remove();
    });
    constructor(public options: { content: HTMLElement; position: LatLng }) {
      const label = options.content.querySelector<HTMLElement>('[data-role="label"]')!;
      Object.defineProperties(label, {
        offsetWidth: { value: labelWidths?.[overlays.length] ?? Math.min(170, (label.textContent?.length ?? 0) * 11 + 18) },
        offsetHeight: { value: 26 },
      });
      overlays.push(this);
    }
  }
  const routes: Polyline[] = [];
  class Polyline {
    setMap = vi.fn();
    constructor(public options: { path: LatLng[]; strokeColor: string }) {
      routes.push(this);
    }
  }
  class LatLngBounds {
    positions: LatLng[] = [];
    extend = vi.fn((position: LatLng) => this.positions.push(position));
  }
  window.kakao = {
    maps: {
      Map: MockMap,
      LatLng,
      CustomOverlay,
      Polyline,
      LatLngBounds,
      event,
      load: (callback: () => void) => callback(),
    },
  };
  return { maps, overlays, routes, event };
}

function installFrameQueue() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextId = 1;
  const request = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => callbacks.delete(id));
  return {
    callbacks,
    request,
    cancel,
    flush: () => act(() => {
      // The resize callback can schedule a second pass for labels.
      while (callbacks.size) {
        const frame = [...callbacks.values()];
        callbacks.clear();
        frame.forEach((callback) => callback(0));
      }
    }),
  };
}

function renderedMarkerPoints(sdk: ReturnType<typeof installSdkMock>) {
  return sdk.overlays.map(({ options }) => {
    const point = sdk.maps[0].projection.containerPointFromCoords(options.position);
    const translate = /^translate\((-?[\d.e+]+)px,\s*(-?[\d.e+]+)px\)$/.exec(options.content.style.transform);
    return { x: point.x + Number(translate?.[1] ?? 0), y: point.y + Number(translate?.[2] ?? 0) };
  });
}

function expectUnobstructedLabels(sdk: ReturnType<typeof installSdkMock>, viewport: { width: number; height: number }) {
  const map = sdk.maps[0];
  const routePoints = sdk.overlays.map(({ options }) => map.projection.containerPointFromCoords(options.position));
  const points = renderedMarkerPoints(sdk);
  const paths = [routePoints, ...points.map((point, index) => [routePoints[index], point])];
  const labels = sdk.overlays.map(({ options }, index) => {
    const label = options.content.querySelector<HTMLElement>('[data-role="label"]')!;
    expect(label.style.visibility, `${label.textContent} 이름표가 보여야 한다`).toBe("visible");
    const rect = {
      x: points[index].x - 16 + Number.parseFloat(label.style.left),
      y: points[index].y - 16 + Number.parseFloat(label.style.top),
      width: label.offsetWidth,
      height: label.offsetHeight,
    };
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
    return rect;
  });
  for (const [index, label] of labels.entries()) {
    for (const other of labels.slice(index + 1)) {
      const separated = label.x + label.width <= other.x || other.x + other.width <= label.x
        || label.y + label.height <= other.y || other.y + other.height <= label.y;
      expect(separated, "이름표 사이에 겹침이 없어야 한다").toBe(true);
    }
    for (const point of points) {
      const separated = label.x + label.width <= point.x - 25 || label.x >= point.x + 25
        || label.y + label.height <= point.y - 25 || label.y >= point.y + 25;
      expect(separated, "이름표가 강조된 번호 원을 가리지 않아야 한다").toBe(true);
    }
    for (const path of paths) for (const [routeIndex, end] of path.entries()) {
      if (routeIndex === 0) continue;
      const start = path[routeIndex - 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) * 2));
      // Sample every half pixel, including both ends, to inspect the actual rendered label offsets.
      for (let step = 0; step <= steps; step += 1) {
        const point = { x: start.x + (end.x - start.x) * step / steps, y: start.y + (end.y - start.y) * step / steps };
        expect(point.x < label.x - 5 || point.x > label.x + label.width + 5
          || point.y < label.y - 5 || point.y > label.y + label.height + 5,
        "이름표가 동선을 가리지 않아야 한다").toBe(true);
      }
    }
  }
}

describe("KakaoMap", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_KAKAO_JS_KEY", "test-kakao-js-key");
  });

  afterEach(async () => {
    cleanup();
    // 진행 중인 공유 SDK 요청도 종료해 다음 테스트에 남기지 않는다.
    await act(async () => {
      document.querySelectorAll('script[src*="dapi.kakao.com"]').forEach((script) => {
        fireEvent.error(script);
        script.remove();
      });
    });
    delete window.kakao;
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("키가 없어도 지도 높이를 유지하며 제품 안내만 보여준다", () => {
    vi.stubEnv("VITE_KAKAO_JS_KEY", "");
    const { container } = render(<KakaoMap spots={spots} mapClassName="h-72 sm:h-96" />);

    expect(screen.getByRole("status")).toHaveTextContent("지도를 준비하고 있어요.");
    expect(screen.queryByText(/VITE_KAKAO/)).not.toBeInTheDocument();
    const mapContainer = container.querySelector('[aria-label="장소 위치 지도"]');
    expect(mapContainer).toBeInTheDocument();
    expect(mapContainer?.parentElement).toHaveClass("h-72", "sm:h-96");
  });

  test("잘못된 좌표를 제외하면서 방문 번호와 명시한 번호를 유지한다", async () => {
    const sdk = installSdkMock();
    const invalid: KakaoMapSpot[] = [
      { spotId: 3, title: "좌표 누락", latitude: null, longitude: null },
      { spotId: 4, title: "원점", latitude: 0, longitude: 0 },
      { spotId: 5, title: "무한대", latitude: Infinity, longitude: 127 },
      { spotId: 6, title: "숫자 아님", latitude: NaN, longitude: 127 },
      { spotId: 7, title: "국외", latitude: 48.8, longitude: 2.3 },
    ];
    expect(invalid.every((spot) => !hasMapCoordinates(spot))).toBe(true);
    expect(hasMapCoordinates({ latitude: 33.3, longitude: 126.5 })).toBe(true);
    const input = [spots[0], ...invalid, spots[1], { ...spots[0], spotId: 8, markerNumber: 12 }];
    render(<KakaoMap spots={input} onSpotClick={vi.fn()} />);

    await screen.findByRole("button", { name: "7번 정동진 선택" });
    expect(sdk.overlays.map((overlay) => overlay.options.content.querySelector('[data-role="badge"]')?.textContent))
      .toEqual(["1", "7", "12"]);
    expect(sdk.routes[0].options.path).toHaveLength(3);
    expect(input).toHaveLength(8);
    expect(screen.getByText("위치를 확인할 수 없는 장소 5곳은 목록에서 볼 수 있어요.")).toBeInTheDocument();
  });

  test.each([
    { latitude: null, longitude: null },
    { latitude: 37.8, longitude: null },
    { latitude: null, longitude: 128.9 },
    { latitude: NaN, longitude: 128.9 },
    { latitude: 37.8, longitude: Infinity },
    { latitude: 91, longitude: 128.9 },
    { latitude: 37.8, longitude: 181 },
    { latitude: 0, longitude: 0 },
    {},
  ])("유효한 좌표가 없으면 SDK를 요청하지 않고 위치 누락을 안내한다 (%j)", (coordinates) => {
    render(<KakaoMap spots={[{ spotId: 1, title: "장소", ...coordinates }]} />);

    expect(screen.getByRole("status")).toHaveTextContent("위치 정보가 등록되지 않은 장소예요.");
    expect(screen.queryByRole("region", { name: "장소 위치 지도" })).not.toBeInTheDocument();
    expect(document.querySelector('script[src*="dapi.kakao.com"]')).toBeNull();
  });

  test("장소 추가·제거 후에도 지도와 방문 번호를 복원한다", async () => {
    const sdk = installSdkMock();
    const unavailable = { spotId: 3, title: "위치 없음", latitude: null, longitude: null };
    const { container, rerender } = render(<KakaoMap spots={[]} onSpotClick={vi.fn()} />);
    const mapContainer = container.querySelector('[aria-label="장소 위치 지도"]');
    expect(screen.getByRole("status")).toHaveTextContent("지도에 표시할 장소가 없어요.");
    expect(sdk.maps).toHaveLength(0);

    rerender(<KakaoMap spots={[unavailable, ...spots]} onSpotClick={vi.fn()} />);
    await screen.findByRole("button", { name: "2번 경포해변 선택" });
    const previousOverlays = [...sdk.overlays];
    const previousRoute = sdk.routes[0];

    rerender(<KakaoMap spots={[unavailable]} onSpotClick={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("위치 정보가 등록되지 않은 장소예요.");
    previousOverlays.forEach((overlay) => expect(overlay.setMap).toHaveBeenLastCalledWith(null));
    expect(previousRoute.setMap).toHaveBeenLastCalledWith(null);

    rerender(<KakaoMap spots={[unavailable, ...spots]} onSpotClick={vi.fn()} />);
    await screen.findByRole("button", { name: "2번 경포해변 선택" });
    expect(screen.getByRole("region", { name: "장소 위치 지도" })).toBe(mapContainer);
    expect(sdk.routes[sdk.routes.length - 1].options.path).toHaveLength(2);
  });

  test("표시 마커만 바뀌면 이동·확대와 목록 번호를 유지하고 범위 좌표가 바뀌면 다시 맞춘다", async () => {
    const sdk = installSdkMock({ viewport: { width: 800, height: 400 }, fittedLevel: 6 });
    const frames = installFrameQueue();
    const onSpotClick = vi.fn();
    const { rerender } = render(<KakaoMap
      spots={[{ ...spots[0], markerNumber: 21 }]}
      viewportSpots={spots}
      showRoute={false}
      onSpotClick={onSpotClick}
    />);
    await screen.findByRole("button", { name: "21번 경포해변 선택" });
    frames.flush();
    const map = sdk.maps[0];
    expect(map.positions).toEqual(spots.map(({ latitude, longitude }) => ({ latitude, longitude })));
    // 표시된 마커가 하나여도 두 장소를 포함하는 범위로 맞춘다.
    expect(map.getLevel()).toBe(6);
    act(() => {
      map.setLevel(4);
      map.panTo(map.positions[0]);
    });
    frames.flush();
    const userOffset = { ...map.offset };
    map.setBounds.mockClear();
    map.setLevel.mockClear();
    map.panTo.mockClear();
    const oldMarker = sdk.overlays[0];

    rerender(<KakaoMap
      spots={[{ ...spots[1], markerNumber: 22 }]}
      viewportSpots={spots.map((spot) => ({ ...spot, title: `${spot.title} 새 이름` }))}
      showRoute={false}
      onSpotClick={onSpotClick}
      highlightedSpotId={2}
    />);
    frames.flush();
    const marker = screen.getByRole("button", { name: "22번 정동진 선택" });
    expect(marker.querySelector('[data-role="badge"]')).toHaveTextContent("22");
    expect(oldMarker.setMap).toHaveBeenLastCalledWith(null);
    expect(map.setBounds).not.toHaveBeenCalled();
    expect(map.setLevel).not.toHaveBeenCalled();
    expect(map.panTo).not.toHaveBeenCalled();
    expect(map.getLevel()).toBe(4);
    expect(map.offset).toEqual(userOffset);
    // 목록의 좌표 안내 등으로 지도 크기가 변해도 지정된 범위를 다시 맞추지 않는다.
    fireEvent(window, new Event("resize"));
    frames.flush();
    expect(map.setBounds).not.toHaveBeenCalled();
    expect(map.getLevel()).toBe(4);
    expect(map.offset).toEqual(userOffset);

    const extendedViewport = [...spots, { spotId: 3, title: "속초해변", latitude: 38.19, longitude: 128.6 }];
    rerender(<KakaoMap
      spots={[{ ...spots[1], markerNumber: 22 }]}
      viewportSpots={extendedViewport}
      showRoute={false}
      onSpotClick={onSpotClick}
      highlightedSpotId={2}
    />);
    frames.flush();
    expect(map.setBounds).toHaveBeenCalledTimes(1);
    expect(map.positions).toEqual(extendedViewport.map(({ latitude, longitude }) => ({ latitude, longitude })));
    expect(map.getLevel()).toBe(6);
    expect(screen.getByRole("button", { name: "22번 정동진 선택" })).toHaveAttribute("data-highlighted", "true");
    expect(sdk.maps).toHaveLength(1);
  });

  test("현재 목록에 표시할 좌표가 없어도 전체 범위의 지도는 유지한다", async () => {
    const sdk = installSdkMock();
    const frames = installFrameQueue();
    const onSpotClick = vi.fn();
    const unavailable = { spotId: 3, title: "위치 없음", latitude: null, longitude: null };
    const { rerender } = render(<KakaoMap spots={[]} viewportSpots={spots} showRoute={false} onSpotClick={onSpotClick} />);
    const mapContainer = await screen.findByRole("region", { name: "장소 위치 지도" });
    frames.flush();
    expect(sdk.overlays).toHaveLength(0);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const map = sdk.maps[0];
    map.setBounds.mockClear();

    rerender(<KakaoMap spots={[spots[0]]} viewportSpots={spots} showRoute={false} onSpotClick={onSpotClick} />);
    const marker = screen.getByRole("button", { name: "1번 경포해변 선택" });
    rerender(<KakaoMap spots={[unavailable]} viewportSpots={spots} showRoute={false} onSpotClick={onSpotClick} />);
    frames.flush();

    expect(screen.getByRole("region", { name: "장소 위치 지도" })).toBe(mapContainer);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(marker).not.toBeInTheDocument();
    expect(screen.getByText("위치를 확인할 수 없는 장소 1곳은 목록에서 볼 수 있어요.")).toBeInTheDocument();
    expect(map.setBounds).not.toHaveBeenCalled();
    expect(sdk.maps).toHaveLength(1);
  });

  test("범위를 따로 지정하지 않은 기존 지도는 장소 변경 시 범위를 다시 맞춘다", async () => {
    const sdk = installSdkMock();
    const frames = installFrameQueue();
    const { rerender } = render(<KakaoMap spots={spots} showRoute={false} />);
    // 지도 컨테이너는 SDK 준비 전에도 존재한다. 최초 마커까지 기다린 후 호출을 초기화한다.
    await screen.findByText("경포해변");
    frames.flush();
    const map = sdk.maps[0];
    map.setBounds.mockClear();

    rerender(<KakaoMap spots={[spots[1]]} showRoute={false} />);
    frames.flush();
    expect(map.setBounds).toHaveBeenCalledTimes(1);
    expect(map.positions).toEqual([{ latitude: spots[1].latitude, longitude: spots[1].longitude }]);
    expect(map.getLevel()).toBe(5);
  });

  test("선택한 마커로 이동하고 키보드와 최신 클릭 핸들러를 지원한다", async () => {
    const sdk = installSdkMock();
    const firstClick = vi.fn();
    const { rerender } = render(<KakaoMap spots={spots} onSpotClick={firstClick} />);
    const marker = await screen.findByRole("button", { name: "2번 정동진 선택" });
    const latestClick = vi.fn();
    rerender(<KakaoMap spots={spots} onSpotClick={latestClick} focusedSpotId={2} highlightedSpotId={1} focusRequestId={1} />);

    expect(sdk.overlays).toHaveLength(2);
    expect(sdk.maps[0].panTo).toHaveBeenCalledWith(expect.objectContaining({ latitude: 37.6, longitude: 129 }));
    expect(marker).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1번 경포해변 선택" })).toHaveAttribute("aria-pressed", "false");
    marker.focus();
    await userEvent.keyboard("{Enter}");
    expect(latestClick).toHaveBeenCalledWith(spots[1]);
    expect(firstClick).not.toHaveBeenCalled();
    sdk.maps[0].panTo.mockClear();
    rerender(<KakaoMap spots={spots} onSpotClick={latestClick} focusedSpotId={2} highlightedSpotId={1} focusRequestId={2} />);
    expect(sdk.maps[0].panTo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ latitude: 37.6, longitude: 129 }));
  });

  test("일정 변경 시 이전 마커와 선을 지우고 빈 일정에서도 정리한다", async () => {
    const sdk = installSdkMock();
    const { rerender, unmount } = render(<KakaoMap spots={spots} />);
    await waitFor(() => expect(sdk.routes).toHaveLength(1));
    const firstRoute = sdk.routes[0];
    const firstMarkers = [...sdk.overlays];

    rerender(<KakaoMap spots={[spots[1], spots[0]]} />);
    expect(firstRoute.setMap).toHaveBeenLastCalledWith(null);
    firstMarkers.forEach((overlay) => expect(overlay.setMap).toHaveBeenLastCalledWith(null));
    expect(sdk.routes[1].options.path[0]).toEqual(expect.objectContaining({ latitude: 37.6 }));
    rerender(<KakaoMap spots={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("지도에 표시할 장소가 없어요.");
    sdk.overlays.forEach((overlay) => expect(overlay.setMap).toHaveBeenLastCalledWith(null));
    expect(sdk.routes[1].setMap).toHaveBeenLastCalledWith(null);
    unmount();
  });

  test("가까운 장소의 이름표를 마커·동선·다른 이름표와 겹치지 않게 배치한다", async () => {
    const viewport = { width: 800, height: 384 };
    const sdk = installSdkMock({
      viewport,
      points: [{ x: 428, y: 56 }, { x: 562, y: 54 }, { x: 452, y: 218 }, { x: 478, y: 266 }],
      labelWidths: [115, 120, 70, 70],
    });
    const frames = installFrameQueue();
    const itinerary: KakaoMapSpot[] = [
      { spotId: 1, title: "만나정 오크밸리본점", latitude: 37.4, longitude: 127.8 },
      { spotId: 2, title: "매화마을(매호리마을)", latitude: 37.401, longitude: 127.9 },
      { spotId: 3, title: "카페데일리", latitude: 37.35, longitude: 127.82 },
      { spotId: 4, title: "조엄기념관", latitude: 37.34, longitude: 127.83 },
    ];
    render(<KakaoMap spots={itinerary} onSpotClick={vi.fn()} highlightedSpotId={1} />);
    await screen.findByRole("button", { name: "4번 조엄기념관 선택" });
    frames.flush();

    expect(sdk.routes).toHaveLength(1);
    expect(sdk.routes[0].options.path).toEqual(sdk.overlays.map(({ options }) => options.position));
    expectUnobstructedLabels(sdk, viewport);
  });

  test("가까이 모인 마커는 처음부터 모든 이름표가 보이는 크기로 확대한다", async () => {
    const viewport = { width: 800, height: 600 };
    const sdk = installSdkMock({
      viewport,
      points: [{ x: 390, y: 300 }, { x: 400, y: 300 }, { x: 410, y: 300 }],
      labelWidths: [160, 160, 160],
      fittedLevel: 6,
    });
    const frames = installFrameQueue();
    const nearbySpots = [...spots, { ...spots[0], spotId: 3, title: "세 번째 장소" }];
    render(<KakaoMap spots={nearbySpots} onSpotClick={vi.fn()} />);
    await screen.findByRole("button", { name: "3번 세 번째 장소 선택" });
    frames.flush();

    expect(sdk.maps[0].getLevel()).toBeLessThan(6);
    expect(sdk.maps[0].setLevel).toHaveBeenCalled();
    const projected = sdk.overlays.map(({ options }) => sdk.maps[0].projection.containerPointFromCoords(options.position));
    expect(projected[1].x - projected[0].x).toBeGreaterThanOrEqual(50);
    projected.forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(30);
      expect(x).toBeLessThanOrEqual(viewport.width - 30);
      expect(y).toBeGreaterThanOrEqual(30);
      expect(y).toBeLessThanOrEqual(viewport.height - 30);
    });
    expectUnobstructedLabels(sdk, viewport);
  });

  test("모바일에서 확대할 수 없는 인접 마커도 원래 경로를 유지하며 모두 구분한다", async () => {
    const viewport = { width: 328, height: 400 };
    const sdk = installSdkMock({
      viewport,
      points: [{ x: 39, y: 280 }, { x: 286, y: 116 }, { x: 262, y: 101 }, { x: 139, y: 254 }],
      labelWidths: [100, 130, 80, 68],
    });
    const frames = installFrameQueue();
    const itinerary = [
      ...spots,
      { ...spots[0], spotId: 3, title: "세 번째 장소" },
      { ...spots[1], spotId: 4, title: "네 번째 장소" },
    ];
    render(<KakaoMap spots={itinerary} onSpotClick={vi.fn()} />);
    await screen.findByRole("button", { name: "4번 네 번째 장소 선택" });
    frames.flush();

    const displayed = renderedMarkerPoints(sdk);
    for (const [index, point] of displayed.entries()) {
      expect(point.x).toBeGreaterThanOrEqual(25);
      expect(point.x).toBeLessThanOrEqual(viewport.width - 25);
      expect(point.y).toBeGreaterThanOrEqual(25);
      expect(point.y).toBeLessThanOrEqual(viewport.height - 25);
      displayed.slice(index + 1).forEach((other) => {
        expect(Math.hypot(other.x - point.x, other.y - point.y)).toBeGreaterThanOrEqual(48);
      });
    }
    expect(sdk.routes[0].options.path).toEqual(sdk.overlays.map(({ options }) => options.position));
    let displaced = false;
    sdk.overlays.forEach(({ options }, index) => {
      const original = sdk.maps[0].projection.containerPointFromCoords(options.position);
      const distance = Math.hypot(displayed[index].x - original.x, displayed[index].y - original.y);
      if (distance > 0) displaced = true;
      const connector = options.content.querySelector<HTMLElement>('[data-role="connector"]')!;
      expect(connector.style.visibility).toBe(distance > 16 ? "visible" : "hidden");
    });
    expect(displaced).toBe(true);
    expectUnobstructedLabels(sdk, viewport);
  });

  test("지도를 이동하거나 축척을 바꾸면 현재 화면 좌표로 이름표를 다시 배치한다", async () => {
    const viewport = { width: 800, height: 400 };
    const sdk = installSdkMock({
      viewport,
      points: [{ x: 620, y: 130 }, { x: 550, y: 270 }],
      labelWidths: [120, 120],
    });
    const frames = installFrameQueue();
    render(<KakaoMap spots={spots} onSpotClick={vi.fn()} />);
    await screen.findByRole("button", { name: "1번 경포해변 선택" });
    frames.flush();
    const map = sdk.maps[0];
    const label = sdk.overlays[0].options.content.querySelector<HTMLElement>('[data-role="label"]')!;
    const firstOffset = label.style.left;
    expectUnobstructedLabels(sdk, viewport);

    act(() => {
      map.offset.x = 80;
      sdk.event.trigger(map, "bounds_changed");
      sdk.event.trigger(map, "idle");
    });
    frames.flush();
    expect(label.style.left).not.toBe(firstOffset);
    expectUnobstructedLabels(sdk, viewport);

    const projectionCalls = map.projection.containerPointFromCoords.mock.calls.length;
    act(() => map.setLevel(map.getLevel() + 1));
    frames.flush();
    expect(map.projection.containerPointFromCoords.mock.calls.length).toBeGreaterThan(projectionCalls);
    expectUnobstructedLabels(sdk, viewport);
  });

  test("같은 좌표의 방문 마커를 벌리고 연결선으로 실제 위치를 표시한다", async () => {
    const viewport = { width: 800, height: 600 };
    const sdk = installSdkMock({
      viewport,
      points: [{ x: 400, y: 300 }, { x: 400, y: 300 }],
      labelWidths: [100, 100],
    });
    const frames = installFrameQueue();
    render(<KakaoMap spots={[spots[0], { ...spots[0], spotId: 2 }]} onSpotClick={vi.fn()} />);
    await screen.findByRole("button", { name: "2번 경포해변 선택" });
    frames.flush();

    const points = renderedMarkerPoints(sdk);
    expect(Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)).toBeGreaterThanOrEqual(48);
    sdk.overlays.forEach(({ options }) => {
      const connector = options.content.querySelector<HTMLElement>('[data-role="connector"]')!;
      expect(connector.style.visibility).toBe("visible");
      expect(Number.parseFloat(connector.style.width)).toBeGreaterThan(16);
    });
    expect(sdk.routes[0].options.path[0]).toEqual(sdk.routes[0].options.path[1]);
    expectUnobstructedLabels(sdk, viewport);
  });

  test("마커 강조를 바꿔도 이미 계산된 이름표 위치를 유지한다", async () => {
    const viewport = { width: 800, height: 400 };
    const sdk = installSdkMock({
      viewport,
      points: [{ x: 100, y: 110 }, { x: 650, y: 290 }],
    });
    const frames = installFrameQueue();
    const onSpotClick = vi.fn();
    const { rerender } = render(<KakaoMap spots={spots} onSpotClick={onSpotClick} />);
    await screen.findByRole("button", { name: "1번 경포해변 선택" });
    frames.flush();
    const label = sdk.overlays[0].options.content.querySelector<HTMLElement>('[data-role="label"]')!;
    const position = { left: label.style.left, top: label.style.top, visibility: label.style.visibility };
    expect(position.visibility).toBe("visible");

    rerender(<KakaoMap spots={spots} onSpotClick={onSpotClick} highlightedSpotId={1} />);
    expect(label.style.left).toBe(position.left);
    expect(label.style.top).toBe(position.top);
    expect(label.style.visibility).toBe(position.visibility);
    frames.flush();
    expect(label.style.left).toBe(position.left);
    expect(label.style.top).toBe(position.top);
    expectUnobstructedLabels(sdk, viewport);
  });

  test("지도를 제거하면 지도 이벤트와 대기 중인 재배치 프레임을 정리한다", async () => {
    const sdk = installSdkMock({ viewport: { width: 800, height: 400 } });
    const frames = installFrameQueue();
    const { unmount } = render(<KakaoMap spots={spots} onSpotClick={vi.fn()} />);
    await screen.findByRole("button", { name: "1번 경포해변 선택" });
    frames.flush();
    const map = sdk.maps[0];
    expect(sdk.event.addListener.mock.calls.map(([, name]) => name)).toEqual(["bounds_changed", "zoom_changed", "idle"]);
    act(() => sdk.event.trigger(map, "bounds_changed"));
    const pendingFrames = [...frames.callbacks.keys()];
    expect(pendingFrames).toHaveLength(1);
    unmount();

    pendingFrames.forEach((id) => expect(frames.cancel).toHaveBeenCalledWith(id));
    expect(frames.callbacks.size).toBe(0);
    for (const [target, name, callback] of sdk.event.addListener.mock.calls) {
      expect(sdk.event.removeListener).toHaveBeenCalledWith(target, name, callback);
    }
    const requestCount = frames.request.mock.calls.length;
    act(() => sdk.event.trigger(map, "bounds_changed"));
    expect(frames.request.mock.calls).toHaveLength(requestCount);
  });

  test("SDK 실패 후 같은 지도 컨테이너에서 다시 시도할 수 있다", async () => {
    const { container } = render(<KakaoMap spots={spots} />);
    const mapContainer = container.querySelector('[aria-label="장소 위치 지도"]');
    const script = document.querySelector('script[src*="dapi.kakao.com"]');
    expect(script).not.toBeNull();
    fireEvent.error(script!);
    expect(await screen.findByText("지도를 불러오지 못했어요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    const retryScript = document.querySelector('script[src*="dapi.kakao.com"]');
    expect(retryScript).not.toBe(script);
    const sdk = installSdkMock();
    fireEvent.load(retryScript!);
    await screen.findByRole("region", { name: "장소 위치 지도" });
    expect(sdk.maps[0].container).toBe(mapContainer);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("SDK 응답이 없으면 제한 시간 후 재시도를 안내한다", async () => {
    vi.useFakeTimers();
    render(<KakaoMap spots={spots} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("지도를 불러오지 못했어요.");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});
