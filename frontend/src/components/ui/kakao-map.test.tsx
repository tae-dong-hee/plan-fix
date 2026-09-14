import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import KakaoMap, { type KakaoMapSpot } from "@/components/ui/kakao-map";
import { hasMapCoordinates } from "@/lib/map-coordinates";

const spots: KakaoMapSpot[] = [
  { spotId: 1, title: "경포해변", latitude: 37.8, longitude: 128.9 },
  { spotId: 2, title: "정동진", latitude: 37.6, longitude: 129.0 },
];

function installSdkMock() {
  class LatLng {
    constructor(public latitude: number, public longitude: number) {}
  }
  const maps: MockMap[] = [];
  class MockMap {
    setBounds = vi.fn();
    setLevel = vi.fn();
    panTo = vi.fn();
    relayout = vi.fn();
    constructor(public container: HTMLElement) {
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
  window.kakao = {
    maps: {
      Map: MockMap,
      LatLng,
      CustomOverlay,
      Polyline,
      LatLngBounds: class { extend = vi.fn(); },
      load: (callback: () => void) => callback(),
    },
  };
  return { maps, overlays, routes };
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
