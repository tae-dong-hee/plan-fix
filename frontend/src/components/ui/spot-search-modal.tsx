import { useEffect, useState } from "react";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import { MISSING_SPOT_LOCATION } from "@/lib/spot-display";
import SpotImage from "@/components/ui/spot-image";
import KakaoMap from "@/components/ui/kakao-map";
import { SPOT_CATEGORY_OPTIONS } from "@/constants/spot-categories";
import { PopularSpot, searchSpots } from "@/services/spots";

export interface SpotSearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (spot: PopularSpot) => void;
  /** 이미 이 Day에 담긴 spotId. 중복 선택을 막는다 */
  excludedSpotIds?: number[];
  /** 헤더에 "Day 2에 추가"로 표시 (선택) */
  dayNumber?: number;
}

export default function SpotSearchModal({
  open,
  onClose,
  onSelect,
  excludedSpotIds = [],
  dayNumber,
}: SpotSearchModalProps) {
  const [keyword, setKeyword] = useState("");
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const [spots, setSpots] = useState<PopularSpot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  /** 목록에서 마우스를 올린 장소. 지도 마커 강조에 쓴다. */
  const [hoveredSpotId, setHoveredSpotId] = useState<number | null>(null);

  // 모달 열릴 때 키워드 초기화
  useEffect(() => {
    if (open) {
      setKeyword("");
      setDebouncedKeyword("");
      setError(null);
      setSelectedCategory(null);
      setHoveredSpotId(null);
    }
  }, [open]);

  // 300ms 디바운스
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      setDebouncedKeyword(keyword);
    }, 300);
    return () => clearTimeout(timer);
  }, [keyword, open]);

  // 스팟 목록 검색
  useEffect(() => {
    if (!open) return;

    let ignore = false;
    setLoading(true);
    setError(null);

    const fetchSpots = async () => {
      try {
        const trimmed = debouncedKeyword.trim();
        const res = await searchSpots({
          ...(trimmed ? { keyword: trimmed } : { sort: "popular" as const }),
          category: selectedCategory ?? undefined,
          size: 20,
        });
        if (!ignore) {
          setSpots(res.items || []);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "장소 검색에 실패했습니다.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchSpots();

    return () => {
      ignore = true;
    };
  }, [open, debouncedKeyword, selectedCategory]);

  // 스크롤 잠금 및 ESC 키 이벤트
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="spot-search-backdrop"
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="spot-search-title"
        className="relative flex h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-2xl sm:h-[650px] sm:max-w-4xl sm:rounded-2xl"
      >
        {/* 모바일 상단 핸들 */}
        <div className="mx-auto -mt-2 mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/20 sm:hidden" />

        {/* 헤더 */}
        <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <h2
                id="spot-search-title"
                className="text-lg font-bold tracking-tight text-foreground sm:text-xl"
              >
                장소 검색
              </h2>
              {dayNumber ? (
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Day {dayNumber}에 추가
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              여행 일정에 추가할 강원도 명소 및 맛집을 검색하세요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="창 닫기"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        {/* 검색 입력창 */}
        <div className="border-b border-border bg-card/50 p-4 sm:px-6">
          <div className="relative">
            <Search
              className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="장소 이름, 지역으로 검색해보세요 (예: 경포해변, 속초)"
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-9 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="검색어 지우기"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* 카테고리 필터 */}
          <div role="group" aria-label="카테고리 필터" className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              aria-pressed={selectedCategory === null}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                selectedCategory === null
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              전체
            </button>
            {SPOT_CATEGORY_OPTIONS.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setSelectedCategory((prev) => (prev === category ? null : category))}
                aria-pressed={selectedCategory === category}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  selectedCategory === category
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* 지도 + 목록: 목록에서 마우스를 올리면 지도에서 해당 위치가 강조된다 */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* 지도 (모바일은 위, 데스크톱은 오른쪽) */}
          <div className="shrink-0 border-b border-border p-3 sm:order-2 sm:flex sm:w-[45%] sm:border-b-0 sm:border-l sm:p-4">
            <KakaoMap
              className="w-full sm:flex sm:flex-col"
              mapClassName="h-40 sm:h-full sm:min-h-0 sm:flex-1"
              spots={spots}
              showRoute={false}
              highlightedSpotId={hoveredSpotId}
              onSpotClick={(spot) => {
                if (excludedSpotIds.includes(spot.spotId)) return;
                const selected = spots.find((s) => s.spotId === spot.spotId);
                if (!selected) return;
                onSelect(selected);
                onClose();
              }}
            />
          </div>

          {/* 장소 목록 */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:order-1 sm:p-5">
          {loading ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">장소를 검색하고 있습니다...</span>
            </div>
          ) : error ? (
            <div className="flex h-48 flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-destructive">{error}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                잠시 후 다시 시도해주세요.
              </p>
            </div>
          ) : spots.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-center text-muted-foreground">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm font-medium">검색 결과가 없습니다.</p>
              <p className="text-xs text-muted-foreground">다른 검색어로 찾아보세요.</p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {spots.map((spot) => {
                const isExcluded = excludedSpotIds.includes(spot.spotId);
                return (
                  <div
                    key={spot.spotId}
                    data-testid={`spot-search-item-${spot.spotId}`}
                    onMouseEnter={() => setHoveredSpotId(spot.spotId)}
                    onMouseLeave={() =>
                      setHoveredSpotId((prev) => (prev === spot.spotId ? null : prev))
                    }
                    onFocus={() => setHoveredSpotId(spot.spotId)}
                    className={`flex items-center justify-between gap-3.5 rounded-xl border p-3 transition-colors ${
                      isExcluded
                        ? "border-border bg-muted/40 opacity-60"
                        : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
                    } ${hoveredSpotId === spot.spotId ? "border-primary/60 bg-muted/40" : ""}`}
                  >
                    {/* 썸네일 */}
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <SpotImage
                        src={spot.thumbnail}
                        alt={spot.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>

                    {/* 장소 정보 */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {spot.title}
                        </span>
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {spot.category}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {[spot.region, spot.sigungu].map((value) => value?.trim()).filter(Boolean).join(" ") || MISSING_SPOT_LOCATION}
                      </p>
                    </div>

                    {/* 선택 / 담김 버튼 */}
                    {isExcluded ? (
                      <span className="flex items-center gap-1 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        <Check className="h-3.5 w-3.5" />
                        담김
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(spot);
                          onClose();
                        }}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-transform active:scale-95 hover:bg-primary/90"
                      >
                        선택
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
      </section>
    </div>
  );
}
