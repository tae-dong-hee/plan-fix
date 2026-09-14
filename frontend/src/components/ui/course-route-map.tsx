import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin, Navigation, Route } from "lucide-react";

import KakaoMap from "@/components/ui/kakao-map";
import SpotImage from "@/components/ui/spot-image";
import { hasMapCoordinates } from "@/lib/map-coordinates";
import { MISSING_SPOT_ADDRESS } from "@/lib/spot-display";
import type { CourseDay, CourseSpotSummary } from "@/services/course";

type CourseRouteMapProps = {
  days: CourseDay[];
  startDate?: string | null;
};

function dayDate(startDate: string | null | undefined, dayNumber: number): string | null {
  if (!startDate) return null;
  const date = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + dayNumber - 1);
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short" }).format(date);
}

function SpotPhoto({ spot, className, descriptive = false }: { spot: CourseSpotSummary; className: string; descriptive?: boolean }) {
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/[0.06] text-primary/50 ${className}`}>
      <SpotImage src={spot.thumbnail} alt={descriptive ? spot.title || "여행 장소" : ""} className="h-full w-full object-cover" loading="lazy" />
    </div>
  );
}

/** 코스 상세 응답만으로 선택한 일차의 지도와 장소 목록을 함께 표시한다. */
export default function CourseRouteMap({ days, startDate }: CourseRouteMapProps) {
  const id = useId();
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const orderedDays = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const [activeDayNumber, setActiveDayNumber] = useState<number | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<number | null>(null);
  const [focusedSpotId, setFocusedSpotId] = useState<number | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [hoveredSpotId, setHoveredSpotId] = useState<number | null>(null);

  const day = orderedDays.find((item) => item.dayNumber === activeDayNumber) ?? orderedDays[0];
  const spots = [...(day?.spots ?? [])].sort((a, b) => a.sequence - b.sequence);
  const selectedSpot = spots.find((spot) => spot.spotId === selectedSpotId)
    ?? spots.find(hasMapCoordinates) ?? spots[0];
  const dateLabel = day ? dayDate(startDate, day.dayNumber) : null;
  const mapSpots = spots.map((spot) => ({ ...spot, markerNumber: spot.sequence + 1 }));
  const highlightedSpotId = hoveredSpotId ?? selectedSpot?.spotId ?? null;
  const directionsUrl = selectedSpot && hasMapCoordinates(selectedSpot)
    ? `https://map.kakao.com/link/to/${encodeURIComponent(selectedSpot.title || "여행 장소")},${selectedSpot.latitude},${selectedSpot.longitude}`
    : null;

  function selectDay(dayNumber: number) {
    setActiveDayNumber(dayNumber);
    setSelectedSpotId(null);
    setFocusedSpotId(null);
    setHoveredSpotId(null);
  }

  function selectSpot(spotId: number) {
    const spot = spots.find((item) => item.spotId === spotId);
    if (!spot) return;
    setSelectedSpotId(spotId);
    setFocusedSpotId(hasMapCoordinates(spot) ? spotId : null);
    setFocusRequestId((requestId) => requestId + 1);
    setHoveredSpotId(null);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight": nextIndex = (index + 1) % orderedDays.length; break;
      case "ArrowLeft": nextIndex = (index - 1 + orderedDays.length) % orderedDays.length; break;
      case "Home": nextIndex = 0; break;
      case "End": nextIndex = orderedDays.length - 1; break;
      default: return;
    }
    event.preventDefault();
    selectDay(orderedDays[nextIndex].dayNumber);
    tabsRef.current[nextIndex]?.focus();
  }

  if (!day) {
    return <div className="rounded-2xl border border-dashed border-border bg-background p-10 text-center text-sm text-muted-foreground">등록된 여행 일정이 없어요.</div>;
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="overflow-hidden rounded-3xl border border-primary/15 bg-background shadow-[0_12px_40px_-24px_hsl(var(--primary)/0.3)]">
      <div className="bg-gradient-to-br from-primary/[0.07] via-primary/[0.02] to-background px-5 pb-5 pt-6 sm:px-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Route className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id={`${id}-heading`} className="text-lg font-bold tracking-tight text-foreground sm:text-xl">여행 동선</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">하루의 여행을 지도에서 한눈에 살펴보세요.</p>
            </div>
          </div>
          <span className="mt-1 hidden shrink-0 rounded-full border border-primary/10 bg-background/80 px-3 py-1.5 text-xs font-semibold text-primary sm:inline-flex">{orderedDays.length}일의 여행</span>
        </div>
        <div role="tablist" aria-label="여행 일차" className="scrollbar-hide -mx-1 mt-5 flex gap-2 overflow-x-auto p-1">
          {orderedDays.map((item, index) => {
            const active = item.dayNumber === day.dayNumber;
            const label = dayDate(startDate, item.dayNumber);
            return (
              <button
                key={item.dayNumber}
                ref={(node) => { tabsRef.current[index] = node; }}
                id={`${id}-tab-${item.dayNumber}`}
                type="button"
                role="tab"
                aria-label={`Day ${item.dayNumber}`}
                aria-selected={active}
                aria-controls={`${id}-panel`}
                tabIndex={active ? 0 : -1}
                onClick={() => selectDay(item.dayNumber)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${active ? "border-primary bg-primary font-bold text-primary-foreground shadow-sm" : "border-border/70 bg-background/80 font-medium text-muted-foreground hover:border-primary/30 hover:text-primary"}`}
              >
                <span>Day {item.dayNumber}</span>
                {label && <span className={`text-[11px] font-normal ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${day.dayNumber}`}>
        <div className="px-4 sm:px-6">
          <KakaoMap
            spots={mapSpots}
            highlightedSpotId={highlightedSpotId}
            focusedSpotId={focusedSpotId}
            focusRequestId={focusRequestId}
            onSpotClick={(spot) => selectSpot(spot.spotId)}
            mapClassName="h-96 sm:h-[34rem]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-2"><span className="w-5 border-t-2 border-dashed border-primary/70" aria-hidden="true" />점선은 장소의 방문 순서를 보여줘요.</span>
            <span>장소를 선택하면 자세히 볼 수 있어요.</span>
          </div>

          {selectedSpot && (
            <div role="region" aria-label="선택한 장소" className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 sm:p-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <SpotPhoto spot={selectedSpot} descriptive className="h-20 w-20 sm:h-24 sm:w-24" />
                <div className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{selectedSpot.sequence + 1}</span>선택한 장소</span>
                  <h3 className="mt-1 break-words text-base font-bold text-foreground sm:text-lg">{selectedSpot.title || "여행 장소"}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{selectedSpot.address?.trim() || MISSING_SPOT_ADDRESS}</p>
                  {!hasMapCoordinates(selectedSpot) && <p className="mt-1 text-xs text-muted-foreground">위치 정보가 없어 지도에 표시할 수 없어요.</p>}
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to={`/spots/${selectedSpot.spotId}`} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">장소 상세보기<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                {directionsUrl && <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><Navigation className="h-3.5 w-3.5" aria-hidden="true" />길찾기<span className="sr-only"> (새 창)</span></a>}
              </div>
            </div>
          )}
        </div>

        <div data-testid={`day-detail-${day.dayNumber}`} className="px-5 pb-6 pt-6 sm:px-7">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />Day {day.dayNumber} 일정{dateLabel && <span className="ml-1 text-xs font-normal text-muted-foreground">{dateLabel}</span>}</h3>
            <span className="text-xs text-muted-foreground">{spots.length}개 장소</span>
          </div>

          {spots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/[0.025] px-5 py-9 text-center">
              <MapPin className="mx-auto mb-3 h-7 w-7 text-primary/50" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">아직 계획이 없어요.</p>
              <p className="mt-1 text-xs text-muted-foreground">장소를 추가하면 이 날의 여행 동선을 볼 수 있어요.</p>
            </div>
          ) : (
            <ol className="space-y-3" aria-label={`Day ${day.dayNumber} 방문 장소`}>
              {spots.map((spot) => {
                const selected = selectedSpot?.spotId === spot.spotId;
                return (
                  <li key={`${day.dayNumber}-${spot.sequence}`}>
                    <button
                      type="button"
                      aria-label={`${spot.title || "여행 장소"} 지도에서 보기`}
                      aria-pressed={selected}
                      onClick={() => selectSpot(spot.spotId)}
                      onMouseEnter={() => setHoveredSpotId(spot.spotId)}
                      onMouseLeave={() => setHoveredSpotId(null)}
                      onFocus={() => setHoveredSpotId(spot.spotId)}
                      onBlur={() => setHoveredSpotId(null)}
                      className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:gap-4 sm:p-4 ${selected ? "border-primary/40 bg-primary/[0.05]" : "border-border bg-background hover:border-primary/25 hover:bg-primary/[0.025]"}`}
                    >
                      <span className={`mt-4 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selected ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>{spot.sequence + 1}</span>
                      <SpotPhoto spot={spot} className="h-14 w-14 sm:h-16 sm:w-16" />
                      <span className="min-w-0 flex-1 self-center">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="break-words text-sm font-semibold text-foreground">{spot.title || "여행 장소"}</span>{spot.category && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{spot.category}</span>}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{spot.address?.trim() || MISSING_SPOT_ADDRESS}</span>
                        {!hasMapCoordinates(spot) && <span className="mt-1 block text-[11px] text-muted-foreground">위치 정보 없음</span>}
                        {spot.memo && <span className="mt-2 block rounded-lg bg-muted/70 px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">💬 {spot.memo}</span>}
                      </span>
                      <MapPin className={`mt-5 hidden h-4 w-4 shrink-0 sm:block ${selected ? "text-primary" : "text-muted-foreground/50"}`} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
