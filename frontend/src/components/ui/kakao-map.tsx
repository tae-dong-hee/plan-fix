import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { hasSpotCoordinates, MISSING_SPOT_LOCATION } from "@/lib/spot-display";

/** 지도에 찍을 장소. 좌표가 없는 장소(수집 데이터 누락)는 렌더링에서 제외된다. */
export type KakaoMapSpot = {
  spotId: number;
  title: string;
  latitude?: number | null;
  longitude?: number | null;
};

type KakaoMapProps = {
  spots: KakaoMapSpot[];
  /** 마커를 방문 순서대로 선으로 이을지 여부. */
  showRoute?: boolean;
  /** 넘기면 마커를 클릭할 수 있게 되고, 클릭한 장소를 인자로 받는다. */
  onSpotClick?: (spot: KakaoMapSpot) => void;
  /** 목록에서 마우스를 올린 장소. 해당 마커를 강조한다. */
  highlightedSpotId?: number | null;
  className?: string;
  /** 지도 영역 자체의 크기 클래스. 기본값 대신 컨테이너를 꽉 채우고 싶을 때 쓴다. */
  mapClassName?: string;
};

// SDK가 window에 주입되는 전역 객체라 타입이 없다. 이 파일 안에서만 느슨하게 다룬다.
type KakaoNamespace = any; // eslint-disable-line @typescript-eslint/no-explicit-any

declare global {
  interface Window {
    kakao?: KakaoNamespace;
  }
}

/** 여러 지도 인스턴스가 동시에 떠도 스크립트는 한 번만 넣는다. */
let sdkLoadPromise: Promise<void> | null = null;

function loadKakaoSdk(appKey: string): Promise<void> {
  if (window.kakao?.maps?.LatLng) {
    return Promise.resolve();
  }
  if (sdkLoadPromise) {
    return sdkLoadPromise;
  }

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    // autoload=false로 받아서 kakao.maps.load()로 초기화 시점을 직접 잡는다.
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps) {
        sdkLoadPromise = null;
        reject(new Error("Kakao Maps SDK를 초기화하지 못했습니다."));
        return;
      }
      window.kakao.maps.load(() => resolve());
    };
    script.onerror = () => {
      // 실패한 프로미스를 캐시에 남기면 영구히 재시도가 막힌다.
      sdkLoadPromise = null;
      reject(new Error("Kakao Maps SDK를 불러오지 못했습니다."));
    };
    document.head.appendChild(script);
  });

  return sdkLoadPromise;
}

/**
 * 장소 목록을 카카오맵에 번호 마커로 표시한다.
 * 키가 없거나 SDK 로드에 실패해도 페이지 전체가 깨지지 않도록 안내 문구로 대체한다.
 */
export default function KakaoMap({
  spots,
  showRoute = true,
  onSpotClick,
  highlightedSpotId,
  className,
  mapClassName = "h-56 sm:h-64",
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoNamespace>(null);
  const overlaysRef = useRef<KakaoNamespace[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error">("loading");

  // 마커는 콜백이 바뀔 때마다 다시 그리지 않는다. 대신 ref로 항상 최신 핸들러를 호출한다.
  const onSpotClickRef = useRef(onSpotClick);
  onSpotClickRef.current = onSpotClick;

  // 호버 강조는 마커를 다시 그리지 않고 DOM 스타일만 바꿔서 처리한다.
  const markersRef = useRef<Map<number, { element: HTMLElement; overlay: KakaoNamespace }>>(new Map());

  const appKey = import.meta.env.VITE_KAKAO_JS_KEY;
  const plottable = spots.filter(hasSpotCoordinates);
  const hasPlottableSpots = plottable.length > 0;
  // 좌표 배열을 문자열로 만들어 의존성으로 쓴다. 배열 참조가 매 렌더 바뀌어도 재실행되지 않게 한다.
  const positionsKey = plottable.map((s) => `${s.spotId}:${s.latitude},${s.longitude}`).join("|");

  useEffect(() => {
    if (!appKey) {
      setStatus("no-key");
      return;
    }
    if (!hasPlottableSpots) return;

    let cancelled = false;

    loadKakaoSdk(appKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const kakao = window.kakao;

        if (!mapRef.current) {
          mapRef.current = new kakao.maps.Map(containerRef.current, {
            center: new kakao.maps.LatLng(37.8228, 128.1555), // 강원도 중앙 근처
            level: 9,
          });
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, hasPlottableSpots]);

  // 마커·경로 다시 그리기
  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;

    const kakao = window.kakao;
    const map = mapRef.current;

    // 이전에 그린 것 정리
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    markersRef.current.clear();

    if (plottable.length === 0) return;
    map.relayout?.();

    const positions = plottable.map((spot) => new kakao.maps.LatLng(spot.latitude, spot.longitude));

    positions.forEach((position: KakaoNamespace, index: number) => {
      const spot = plottable[index];
      const element = createMarkerElement(
        spot,
        index + 1,
        onSpotClick ? (s) => onSpotClickRef.current?.(s) : undefined,
      );
      const overlay = new kakao.maps.CustomOverlay({
        position,
        yAnchor: 1,
        clickable: Boolean(onSpotClick),
        content: element,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
      markersRef.current.set(spot.spotId, { element, overlay });
    });

    if (showRoute && positions.length > 1) {
      const polyline = new kakao.maps.Polyline({
        path: positions,
        strokeWeight: 3,
        strokeColor: "#7c3aed",
        strokeOpacity: 0.8,
        strokeStyle: "shortdash",
      });
      polyline.setMap(map);
      overlaysRef.current.push(polyline);
    }

    // 모든 장소가 한 화면에 들어오도록 맞춘다.
    const bounds = new kakao.maps.LatLngBounds();
    positions.forEach((position: KakaoNamespace) => bounds.extend(position));
    map.setBounds(bounds);
    // 한 곳만 있으면 setBounds가 과하게 확대되므로 적당히 되돌린다.
    if (positions.length === 1) {
      map.setLevel(5);
    }
  }, [status, positionsKey, showRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // 강조 상태만 갱신 (마커 재생성 없음)
  useEffect(() => {
    markersRef.current.forEach(({ element, overlay }, spotId) => {
      applyMarkerHighlight(element, spotId === highlightedSpotId);
      // 강조된 마커가 다른 마커에 가리지 않도록 위로 올린다
      overlay.setZIndex?.(spotId === highlightedSpotId ? 10 : 1);
    });
  }, [highlightedSpotId, status, positionsKey]);

  const missingCoordCount = spots.length - plottable.length;
  const unavailableMessage = !hasPlottableSpots
    ? (spots.length === 0 ? "지도에 표시할 장소가 없어요." : MISSING_SPOT_LOCATION)
    : status === "no-key"
      ? "지도를 준비 중이에요."
      : status === "error" ? "지도를 불러오지 못했어요." : null;

  return (
    <div className={className}>
      {unavailableMessage && (
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center ${mapClassName}`}
          role="status"
        >
          <MapPin className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{unavailableMessage}</p>
        </div>
      )}
      <div
        ref={containerRef}
        hidden={Boolean(unavailableMessage)}
        className={`w-full overflow-hidden rounded-xl border border-border bg-muted/30 ${mapClassName}`}
        aria-label={unavailableMessage ? undefined : "장소 위치 지도"}
        role={unavailableMessage ? undefined : "img"}
      />
      {missingCoordCount > 0 && hasPlottableSpots && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          위치 정보가 등록되지 않은 장소 {missingCoordCount}곳은 지도에 표시되지 않았어요.
        </p>
      )}
    </div>
  );
}

const MARKER_BADGE_BASE_STYLE =
  "display:flex;align-items:center;justify-content:center;width:22px;height:22px;" +
  "border-radius:9999px;background:#7c3aed;color:#fff;font-size:12px;font-weight:700;" +
  "box-shadow:0 2px 6px rgba(0,0,0,.3);transition:transform .12s ease,background .12s ease";

const MARKER_LABEL_BASE_STYLE =
  "background:rgba(255,255,255,.95);border-radius:6px;padding:2px 6px;font-size:11px;" +
  "white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.2);transition:background .12s ease,color .12s ease";

/** 목록에서 호버한 장소의 마커를 키우고 색을 바꿔 눈에 띄게 한다. */
function applyMarkerHighlight(element: HTMLElement, highlighted: boolean) {
  const badge = element.querySelector<HTMLElement>('[data-role="badge"]');
  const label = element.querySelector<HTMLElement>('[data-role="label"]');
  if (!badge || !label) return;

  if (highlighted) {
    badge.style.cssText = `${MARKER_BADGE_BASE_STYLE};background:#db2777;transform:scale(1.35)`;
    label.style.cssText = `${MARKER_LABEL_BASE_STYLE};background:#db2777;color:#fff;font-weight:700`;
  } else {
    badge.style.cssText = MARKER_BADGE_BASE_STYLE;
    label.style.cssText = MARKER_LABEL_BASE_STYLE;
  }
}

/**
 * 마커를 DOM으로 직접 만든다. 장소 이름을 textContent로 넣기 때문에
 * HTML 문자열을 조립할 때처럼 이스케이프를 신경 쓸 필요가 없다.
 */
function createMarkerElement(
  spot: KakaoMapSpot,
  order: number,
  onSpotClick?: (spot: KakaoMapSpot) => void,
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `display:flex;align-items:center;gap:4px;transform:translateY(-4px);${
    onSpotClick ? "cursor:pointer;" : ""
  }`;

  const badge = document.createElement("span");
  badge.dataset.role = "badge";
  badge.textContent = String(order);
  badge.style.cssText = MARKER_BADGE_BASE_STYLE;

  const label = document.createElement("span");
  label.dataset.role = "label";
  label.textContent = spot.title;
  label.style.cssText = MARKER_LABEL_BASE_STYLE;

  wrapper.append(badge, label);

  if (onSpotClick) {
    wrapper.setAttribute("role", "button");
    wrapper.setAttribute("aria-label", `${spot.title} 선택`);
    wrapper.addEventListener("click", () => onSpotClick(spot));
  }

  return wrapper;
}
