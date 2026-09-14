import { useEffect, useRef, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";

import { hasMapCoordinates } from "@/lib/map-coordinates";
import { MISSING_SPOT_LOCATION } from "@/lib/spot-display";

/** 지도에 찍을 장소. 표시할 수 없는 좌표는 원본 목록을 유지한 채 지도에서만 제외한다. */
export type KakaoMapSpot = {
  spotId: number;
  title: string;
  latitude?: number | null;
  longitude?: number | null;
  /** 목록에 표시한 방문 번호. 생략하면 좌표 필터링 전 목록 순서를 사용한다. */
  markerNumber?: number;
};

type KakaoMapProps = {
  spots: KakaoMapSpot[];
  /** 지점 사이를 방문 순서대로 직선으로 연결한다. */
  showRoute?: boolean;
  onSpotClick?: (spot: KakaoMapSpot) => void;
  /** 목록에서 마우스를 올린 장소를 강조한다. */
  highlightedSpotId?: number | null;
  /** 선택한 장소를 강조하고 해당 위치로 지도를 이동한다. */
  focusedSpotId?: number | null;
  /** 같은 장소를 다시 선택할 때에도 중심을 이동하기 위한 요청 번호. */
  focusRequestId?: number;
  className?: string;
  mapClassName?: string;
};

// 외부 SDK의 전역 타입을 이 파일 안으로 제한한다.
type KakaoNamespace = any; // eslint-disable-line @typescript-eslint/no-explicit-any

declare global {
  interface Window {
    kakao?: KakaoNamespace;
  }
}

let sdkLoadPromise: Promise<void> | null = null;

/** 여러 지도에서 SDK를 공유하며, 실패하거나 시간 초과하면 재시도할 수 있다. */
function loadKakaoSdk(appKey: string): Promise<void> {
  if (window.kakao?.maps?.Map && window.kakao?.maps?.LatLng) {
    return Promise.resolve();
  }
  if (sdkLoadPromise) return sdkLoadPromise;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) {
        script.remove();
        reject(error);
      } else {
        resolve();
      }
    };
    const timeout = window.setTimeout(
      () => finish(new Error("Map SDK load timed out")),
      12_000,
    );
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        finish(new Error("Map SDK is unavailable"));
        return;
      }
      try {
        window.kakao.maps.load(() => {
          finish(window.kakao?.maps?.Map && window.kakao?.maps?.LatLng
            ? undefined
            : new Error("Map SDK initialization failed"));
        });
      } catch {
        finish(new Error("Map SDK initialization failed"));
      }
    };
    script.onerror = () => finish(new Error("Map SDK load failed"));
    document.head.appendChild(script);
  });
  sdkLoadPromise = promise;
  const clearPendingLoad = () => {
    if (sdkLoadPromise === promise) sdkLoadPromise = null;
  };
  void promise.then(clearPendingLoad, clearPendingLoad);
  return promise;
}

type MarkerEntry = {
  spotId: number;
  element: HTMLElement;
  overlay: KakaoNamespace;
  position: KakaoNamespace;
};

export default function KakaoMap({
  spots,
  showRoute = true,
  onSpotClick,
  highlightedSpotId,
  focusedSpotId,
  focusRequestId,
  className,
  mapClassName = "h-56 sm:h-64",
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoNamespace>(null);
  const markersRef = useRef<MarkerEntry[]>([]);
  const viewportRef = useRef<{ bounds: KakaoNamespace; count: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "no-key" | "error" | "empty">("loading");
  const [retryCount, setRetryCount] = useState(0);
  const onSpotClickRef = useRef(onSpotClick);
  onSpotClickRef.current = onSpotClick;
  const focusedSpotIdRef = useRef(focusedSpotId);
  focusedSpotIdRef.current = focusedSpotId;

  const appKey = import.meta.env.VITE_KAKAO_JS_KEY?.trim();
  const plottable = spots
    .map((spot, index) => ({ spot, markerNumber: spot.markerNumber ?? index + 1 }))
    .filter(({ spot }) => hasMapCoordinates(spot));
  const hasPlottable = plottable.length > 0;
  // 배열 참조나 클릭 핸들러가 바뀌어도 같은 지도를 다시 그리지 않는다.
  const positionsKey = JSON.stringify(plottable.map(({ spot, markerNumber }) => [
    spot.spotId, spot.title, spot.latitude, spot.longitude, markerNumber,
  ]));
  const interactive = Boolean(onSpotClick);

  useEffect(() => {
    if (!hasPlottable) {
      setStatus("empty");
      return;
    }
    if (!appKey) {
      setStatus("no-key");
      return;
    }

    let cancelled = false;
    const container = containerRef.current;
    setStatus("loading");
    loadKakaoSdk(appKey)
      .then(() => {
        if (cancelled || !container) return;
        const kakao = window.kakao;
        mapRef.current = new kakao.maps.Map(container, {
          center: new kakao.maps.LatLng(37.8228, 128.1555),
          level: 9,
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      mapRef.current = null;
      viewportRef.current = null;
      // SDK가 붙인 자식만 정리한다. React가 관리하는 컨테이너는 항상 유지한다.
      container?.replaceChildren();
    };
  }, [appKey, retryCount, hasPlottable]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    const kakao = window.kakao;
    const map = mapRef.current;
    const overlays: KakaoNamespace[] = [];
    markersRef.current = [];
    viewportRef.current = null;

    const positions = plottable.map(({ spot }) => new kakao.maps.LatLng(spot.latitude, spot.longitude));
    positions.forEach((position: KakaoNamespace, index: number) => {
      const { spot, markerNumber } = plottable[index];
      const element = createMarkerElement(
        spot,
        markerNumber,
        interactive ? (selectedSpot) => onSpotClickRef.current?.(selectedSpot) : undefined,
      );
      const overlay = new kakao.maps.CustomOverlay({
        position,
        // 이름표의 길이와 무관하게 번호 원의 중심을 실제 좌표에 맞춘다.
        xAnchor: 0.5,
        yAnchor: 0.5,
        clickable: interactive,
        content: element,
      });
      overlay.setMap(map);
      overlays.push(overlay);
      markersRef.current.push({ spotId: spot.spotId, element, overlay, position });
    });

    if (showRoute && positions.length > 1) {
      const primary = containerRef.current
        ? getComputedStyle(containerRef.current).getPropertyValue("--primary").trim()
        : "";
      const polyline = new kakao.maps.Polyline({
        path: positions,
        strokeWeight: 3,
        strokeColor: primary ? `hsl(${primary})` : "#7B4AED",
        strokeOpacity: 0.75,
        strokeStyle: "shortdash",
      });
      polyline.setMap(map);
      overlays.push(polyline);
    }

    if (positions.length > 0) {
      const bounds = new kakao.maps.LatLngBounds();
      positions.forEach((position: KakaoNamespace) => bounds.extend(position));
      viewportRef.current = { bounds, count: positions.length };
      map.setBounds(bounds, 48, 48, 48, 48);
      if (positions.length === 1) map.setLevel(5);
    }

    return () => {
      overlays.forEach((overlay) => overlay.setMap(null));
      markersRef.current = [];
      viewportRef.current = null;
    };
  }, [status, positionsKey, showRoute, interactive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markersRef.current.forEach(({ element, overlay, spotId }) => {
      const selected = spotId === focusedSpotId;
      const highlighted = selected || spotId === highlightedSpotId;
      applyMarkerHighlight(element, highlighted, selected);
      overlay.setZIndex?.(highlighted ? 10 : 1);
    });
  }, [highlightedSpotId, focusedSpotId, status, positionsKey, showRoute, interactive]);

  useEffect(() => {
    const marker = markersRef.current.find(({ spotId }) => spotId === focusedSpotId);
    if (marker) mapRef.current?.panTo(marker.position);
  }, [focusedSpotId, focusRequestId, status, positionsKey, showRoute, interactive]);

  useEffect(() => {
    if (status !== "ready" || !containerRef.current || !mapRef.current) return;
    const map = mapRef.current;
    let frame: number | undefined;
    const resize = () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (mapRef.current !== map) return;
        map.relayout();
        const focused = markersRef.current.find(({ spotId }) => spotId === focusedSpotIdRef.current);
        if (focused) {
          map.panTo(focused.position);
        } else if (viewportRef.current) {
          map.setBounds(viewportRef.current.bounds, 48, 48, 48, 48);
          if (viewportRef.current.count === 1) map.setLevel(5);
        }
      });
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(containerRef.current);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [status]);

  const missingCoordCount = spots.length - plottable.length;
  const message = status === "error"
    ? "지도를 불러오지 못했어요."
    : status === "empty"
      ? (spots.length === 0 ? "지도에 표시할 장소가 없어요." : MISSING_SPOT_LOCATION)
      : status === "no-key"
        ? "지도를 준비하고 있어요."
        : "지도를 불러오고 있어요.";

  return (
    <div className={className}>
      <div className={`relative isolate w-full overflow-hidden rounded-xl border border-border bg-muted/30 ${mapClassName}`}>
        <div
          ref={containerRef}
          className="h-full w-full"
          aria-label="장소 위치 지도"
          aria-hidden={status !== "ready"}
          role="region"
        />
        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 p-6 text-center" role="status">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MapPin className={`h-6 w-6 ${status === "loading" ? "animate-pulse" : ""}`} aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">{message}</p>
            {status === "error" && (
              <button
                type="button"
                onClick={() => setRetryCount((count) => count + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                다시 시도
              </button>
            )}
          </div>
        )}
      </div>
      {missingCoordCount > 0 && hasPlottable && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          위치를 확인할 수 없는 장소 {missingCoordCount}곳은 목록에서 볼 수 있어요.
        </p>
      )}
    </div>
  );
}

const MARKER_BADGE_BASE_STYLE =
  "display:flex;align-items:center;justify-content:center;width:100%;height:100%;box-sizing:border-box;" +
  "border:2px solid #fff;border-radius:9999px;background:hsl(var(--primary,258 82% 61%));" +
  "color:#fff;font-size:12px;font-weight:800;box-shadow:0 2px 8px hsl(var(--primary,258 82% 61%)/.3);" +
  "transform-origin:center;transition:transform .15s ease,box-shadow .15s ease";

const MARKER_LABEL_BASE_STYLE =
  "position:absolute;left:calc(100% + 8px);top:50%;transform:translateY(-50%);" +
  "width:max-content;box-sizing:border-box;" +
  "background:hsl(var(--background,0 0% 100%)/.97);color:hsl(var(--foreground,240 7% 14%));" +
  "border:1px solid hsl(var(--primary,258 82% 61%)/.16);border-radius:9px;padding:5px 8px;" +
  "font-size:11px;font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis;" +
  "white-space:nowrap;box-shadow:0 2px 8px rgba(28,27,44,.12);transition:background .15s ease,color .15s ease";

function applyMarkerHighlight(element: HTMLElement, highlighted: boolean, selected: boolean) {
  const badge = element.querySelector<HTMLElement>('[data-role="badge"]');
  const label = element.querySelector<HTMLElement>('[data-role="label"]');
  if (!badge || !label) return;
  element.dataset.highlighted = String(highlighted);
  element.dataset.selected = String(selected);
  if (element instanceof HTMLButtonElement) element.setAttribute("aria-pressed", String(selected));
  badge.style.cssText = `${MARKER_BADGE_BASE_STYLE}${highlighted
    ? ";transform:scale(1.16);box-shadow:0 0 0 5px hsl(var(--primary,258 82% 61%)/.18),0 3px 12px rgba(28,27,44,.2)"
    : ""}`;
  label.style.cssText = `${MARKER_LABEL_BASE_STYLE}${highlighted
    ? ";background:hsl(var(--primary,258 82% 61%));color:#fff;font-weight:700"
    : ""}`;
}

/** 장소명을 textContent로 설정해 외부 데이터를 HTML로 해석하지 않는다. */
function createMarkerElement(
  spot: KakaoMapSpot,
  order: number,
  onSpotClick?: (spot: KakaoMapSpot) => void,
): HTMLElement {
  const wrapper = document.createElement(onSpotClick ? "button" : "div");
  // SDK가 측정하는 영역은 번호 원 하나로 고정하고 이름표는 영역 밖에 배치한다.
  wrapper.style.cssText = "position:relative;display:block;width:32px;height:32px;overflow:visible;" +
    "padding:0;border:0;border-radius:9999px;background:transparent;font:inherit;" +
    (onSpotClick ? "cursor:pointer;" : "");
  wrapper.className = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary";
  wrapper.title = spot.title;

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
    wrapper.setAttribute("type", "button");
    wrapper.setAttribute("aria-label", `${order}번 ${spot.title} 선택`);
    wrapper.addEventListener("click", () => onSpotClick(spot));
  }
  return wrapper;
}
