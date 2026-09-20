import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SpotGalleryPhoto } from "@/components/ui/spot-photo-gallery";
import { fetchGooglePlacePhotos } from "@/lib/google-place-photos";
import { getVerifiedGoogleCoverPlaceId, type GoogleCoverSpot } from "@/lib/verified-google-places";

type RequestIdentity = { key: string | null };

export function useGoogleSpotCover(spot: GoogleCoverSpot) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const placeId = getVerifiedGoogleCoverPlaceId(spot);
  const requestKey = import.meta.env.VITE_GOOGLE_PLACE_PHOTOS_ENABLED === "true" && apiKey && placeId
    ? JSON.stringify([spot.spotId, placeId, apiKey]) : null;
  // A → B → A로 바뀌어도 이전 A의 늦은 응답이나 출처가 새 화면에 섞이지 않는다.
  const requestIdentity = useMemo<RequestIdentity>(() => ({ key: requestKey }), [requestKey]);
  const liveRequestRef = useRef<RequestIdentity | null>(requestIdentity);
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const viewportRef = useCallback((node: HTMLElement | null) => setViewport(node), []);
  const viewportIdentity = useMemo(() => ({ requestIdentity, viewport }), [requestIdentity, viewport]);
  const [visibleFor, setVisibleFor] = useState<typeof viewportIdentity | null>(null);
  const [cover, setCover] = useState<{ request: RequestIdentity; photo: SpotGalleryPhoto | null } | null>(null);
  const [displayed, setDisplayed] = useState<{ request: RequestIdentity; source: string } | null>(null);
  const requestRef = useRef<{ request: RequestIdentity; promise: Promise<SpotGalleryPhoto[]> } | null>(null);

  useLayoutEffect(() => {
    liveRequestRef.current = requestIdentity;
    return () => { liveRequestRef.current = null; };
  }, [requestIdentity]);

  useEffect(() => {
    if (!requestIdentity.key || !viewport || typeof IntersectionObserver !== "function") return;
    let cancelled = false;
    const observer = new IntersectionObserver((entries) => {
      if (!cancelled && entries.some((entry) => entry.target === viewport && entry.isIntersecting)) {
        setVisibleFor(viewportIdentity);
        observer.disconnect();
      }
    });
    observer.observe(viewport);
    return () => { cancelled = true; observer.disconnect(); };
  }, [requestIdentity, viewport, viewportIdentity]);

  useEffect(() => {
    if (requestRef.current?.request !== requestIdentity) requestRef.current = null;
    if (!requestIdentity.key || !placeId || !apiKey || visibleFor !== viewportIdentity) return;
    let cancelled = false;
    // StrictMode의 effect 재실행은 현재 마운트의 요청만 공유한다. 모듈·브라우저 저장소 캐시는 없다.
    const request = requestRef.current ??= { request: requestIdentity, promise: fetchGooglePlacePhotos(placeId, apiKey) };
    void request.promise.then((photos) => {
      if (!cancelled) setCover({ request: requestIdentity, photo: photos[0] ?? null });
    }).catch(() => {
      if (!cancelled) setCover({ request: requestIdentity, photo: null });
    });
    return () => { cancelled = true; };
  }, [apiKey, placeId, requestIdentity, viewportIdentity, visibleFor]);

  const onSourceChange = useCallback((source: string) => {
    if (!requestIdentity.key || liveRequestRef.current !== requestIdentity) return;
    setDisplayed((current) => current?.request === requestIdentity && current.source === source
      ? current : { request: requestIdentity, source });
  }, [requestIdentity]);
  const photo = requestIdentity.key && cover?.request === requestIdentity ? cover.photo : null;
  const attribution = photo && displayed?.request === requestIdentity && displayed.source === photo.url
    ? photo.google : undefined;

  return { viewportRef, photo, attribution, onSourceChange };
}
