import { render, screen, waitFor } from "@testing-library/react";

import KakaoMap from "@/components/ui/kakao-map";

const mutableEnv = import.meta.env as unknown as Record<string, string | undefined>;

function setKakaoKey(value: string | undefined) {
  if (value === undefined) {
    delete mutableEnv.VITE_KAKAO_JS_KEY;
  } else {
    mutableEnv.VITE_KAKAO_JS_KEY = value;
  }
}

describe("KakaoMap", () => {
  const originalKey = import.meta.env.VITE_KAKAO_JS_KEY;

  afterEach(() => {
    setKakaoKey(originalKey);
    delete window.kakao;
  });

  test("키가 설정되지 않으면 지도 대신 안내 문구를 보여준다", () => {
    setKakaoKey(undefined);

    render(
      <KakaoMap
        spots={[{ spotId: 1, title: "경포해변", latitude: 37.8, longitude: 128.9 }]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "지도를 준비 중이에요.",
    );
    // 키가 없을 땐 지도 컨테이너 자체를 그리지 않는다
    expect(screen.queryByRole("img", { name: "장소 위치 지도" })).not.toBeInTheDocument();
  });

  test("좌표가 없는 장소가 있으면 몇 곳이 빠졌는지 알려준다", () => {
    setKakaoKey("test-kakao-js-key");

    render(
      <KakaoMap
        spots={[
          { spotId: 1, title: "경포해변", latitude: 37.8, longitude: 128.9 },
          { spotId: 2, title: "좌표없음1", latitude: null, longitude: null },
          { spotId: 3, title: "좌표없음2" },
        ]}
      />,
    );

    expect(screen.getByText("위치 정보가 등록되지 않은 장소 2곳은 지도에 표시되지 않았어요.")).toBeInTheDocument();
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
  ])("좌표가 없거나 유효하지 않으면 지도 대신 위치 정보 안내를 보여준다 (%j)", (coordinates) => {
    setKakaoKey(undefined);
    render(<KakaoMap spots={[{ spotId: 1, title: "장소", ...coordinates }]} />);
    expect(screen.getByRole("status")).toHaveTextContent("위치 정보가 등록되지 않은 장소예요.");
    expect(screen.queryByRole("img", { name: "장소 위치 지도" })).not.toBeInTheDocument();
  });

  test("장소가 없는 경우에는 위치 누락 안내 대신 빈 목록 안내를 보여준다", () => {
    render(<KakaoMap spots={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("지도에 표시할 장소가 없어요.");
  });

  test("장소 추가와 제거 후에도 실제 좌표만 지도에 표시하고 지도를 복원한다", async () => {
    setKakaoKey("test-kakao-js-key");
    const setMap = vi.fn();
    const setBounds = vi.fn();
    const relayout = vi.fn();
    const mapConstructor = vi.fn(class {
      setBounds = setBounds;
      setLevel = vi.fn();
      relayout = relayout;
    });
    const latLng = vi.fn(class {});
    window.kakao = { maps: {
      Map: mapConstructor,
      LatLng: latLng,
      CustomOverlay: vi.fn(class { setMap = setMap; }),
      LatLngBounds: vi.fn(class { extend = vi.fn(); }),
    } };
    const { rerender } = render(<KakaoMap spots={[]} />);
    expect(mapConstructor).not.toHaveBeenCalled();

    const spots = [
      { spotId: 1, title: "위치 없음", latitude: null, longitude: null },
      { spotId: 2, title: "경포해변", latitude: 37.8, longitude: 128.9 },
    ];
    rerender(<KakaoMap spots={spots} />);
    await waitFor(() => expect(setBounds).toHaveBeenCalledTimes(1));
    expect(latLng).toHaveBeenCalledWith(37.8, 128.9);
    expect(latLng).not.toHaveBeenCalledWith(null, null);
    const container = screen.getByRole("img", { name: "장소 위치 지도" });

    rerender(<KakaoMap spots={[spots[0]]} />);
    expect(screen.getByRole("status")).toHaveTextContent("위치 정보가 등록되지 않은 장소예요.");
    expect(setMap).toHaveBeenCalledWith(null);

    rerender(<KakaoMap spots={spots} />);
    await waitFor(() => expect(setBounds).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("img", { name: "장소 위치 지도" })).toBe(container);
    expect(mapConstructor).toHaveBeenCalledTimes(1);
    expect(relayout).toHaveBeenCalledTimes(2);
  });
});
