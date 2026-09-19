import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { loadGooglePlacesUiKit } from "@/lib/google-places-sdk";
import { getVerifiedGooglePlaceId, type GooglePlaceSpot } from "@/lib/verified-google-places";

type GooglePlacePhotoCardProps = {
  spot: GooglePlaceSpot;
  children: ReactNode;
};

type PlaceDetailsElement = HTMLElement & { place?: { id?: string } };

function ApprovedGooglePlaceCard({ placeId, apiKey, children }: {
  placeId: string;
  apiKey: string;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"waiting" | "ready" | "failed">("waiting");

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let failed = false;
    let card: PlaceDetailsElement | null = null;
    let timeout: number | undefined;
    const fail = () => {
      if (cancelled || failed) return;
      failed = true;
      window.clearTimeout(timeout);
      card?.remove();
      setStatus("failed");
    };
    const loaded = () => {
      if (cancelled || failed) return;
      // SDK가 다른 장소로 해석한 결과까지 승인된 장소로 간주하지 않는다.
      if (card?.place?.id !== placeId) {
        fail();
        return;
      }
      window.clearTimeout(timeout);
      setStatus("ready");
    };

    void loadGooglePlacesUiKit(apiKey).then(() => {
      if (cancelled) return;
      card = document.createElement("gmp-place-details-compact") as PlaceDetailsElement;
      card.setAttribute("orientation", "vertical");
      card.style.width = "100%";
      const request = document.createElement("gmp-place-details-place-request");
      request.setAttribute("place", placeId);
      const config = document.createElement("gmp-place-content-config");
      const media = document.createElement("gmp-place-media");
      media.setAttribute("lightbox-preferred", "");
      config.append(media, document.createElement("gmp-place-address"), document.createElement("gmp-place-attribution"));
      card.append(request, config);
      card.addEventListener("gmp-load", loaded);
      card.addEventListener("gmp-error", fail);
      timeout = window.setTimeout(fail, 12_000);
      host.appendChild(card);
    }).catch(fail);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      card?.removeEventListener("gmp-load", loaded);
      card?.removeEventListener("gmp-error", fail);
      card?.remove();
    };
  }, [apiKey, placeId, visible]);

  return (
    <div ref={viewportRef} className="relative">
      {status !== "ready" ? children : null}
      <div
        ref={hostRef}
        aria-label="Google Maps 장소 사진"
        aria-hidden={status !== "ready"}
        className={`mx-auto w-full max-w-[300px] ${status === "ready" ? "relative" : "invisible absolute inset-x-0 top-0"}`}
      />
      {status === "ready" ? (
        <p className="mx-auto mt-2 w-full max-w-[300px] px-4 text-xs text-muted-foreground">
          <Link to="/image-credits#google-maps" className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            출처 및 이용 안내
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/** 실사진이 없는 승인 장소 상세에만 표시하며, 기존 갤러리와 목록 썸네일은 그대로 둔다. */
export default function GooglePlacePhotoCard({ spot, children }: GooglePlacePhotoCardProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  const placeId = getVerifiedGooglePlaceId(spot);
  if (!apiKey || !placeId) return children;
  return <ApprovedGooglePlaceCard key={placeId} placeId={placeId} apiKey={apiKey}>{children}</ApprovedGooglePlaceCard>;
}
