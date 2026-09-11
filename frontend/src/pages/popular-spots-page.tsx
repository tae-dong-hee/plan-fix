import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Heart, MapPin, X } from "lucide-react";

import AppNav from "@/components/ui/app-nav";
import GangwonRegionMap, {
  sigunguCodeByRegion,
  type GangwonRegion,
} from "@/components/ui/gangwon-region-map";
import { LoaderFour } from "@/components/ui/unique-loader-components";
import { SPOT_CATEGORY_OPTIONS, isKnownCategory } from "@/constants/spot-categories";
import {
  searchSpots,
  likeSpot,
  unlikeSpot,
  UnauthorizedError,
  type PopularSpot,
} from "@/services/spots";
import { fetchLikedSpots } from "@/services/wishlist";

const GANGWON_REGION_CODE = "51";
const PAGE_SIZE = 20;
const FALLBACK_SPOT_IMAGE =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=85";

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  let start = Math.max(1, current - 2);
  let end = Math.min(total, start + 4);
  if (end - start < 4) {
    start = Math.max(1, end - 4);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

type PopularSpotsPageProps = {
  mode?: "popular" | "discover";
};

export default function PopularSpotsPage({ mode = "popular" }: PopularSpotsPageProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const regionParam = searchParams.get("region") as GangwonRegion | null;
  const selectedRegion =
    regionParam && regionParam in sigunguCodeByRegion ? regionParam : null;

  const categoryParam = searchParams.get("category");
  const selectedCategory = isKnownCategory(categoryParam) ? categoryParam : null;

  const rawPage = parseInt(searchParams.get("page") ?? "1", 10);
  const currentPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [isRegionMapOpen, setIsRegionMapOpen] = useState(false);
  const [popularSpots, setPopularSpots] = useState<PopularSpot[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [popularSpotsError, setPopularSpotsError] = useState(false);
  const [spotsReload, setSpotsReload] = useState(0);
  const [likedSpots, setLikedSpots] = useState<Record<number, boolean>>({});
  const [loadingSpots, setLoadingSpots] = useState<Record<number, boolean>>({});

  const locationName = selectedRegion ?? "강원도";
  const isDiscoverMode = mode === "discover";
  const pageTitle = isDiscoverMode
    ? `${locationName}에서 뭐 하지?`
    : `${locationName} 인기 장소`;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  const closeRegionMap = useCallback(() => setIsRegionMapOpen(false), []);
  const handleSelectRegion = useCallback(
    (region: GangwonRegion) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("region", region);
        next.delete("page");
        return next;
      });
      setIsRegionMapOpen(false);
    },
    [setSearchParams],
  );

  const handleClearRegion = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("region");
      next.delete("page");
      return next;
    });
  }, [setSearchParams]);

  const handleToggleCategory = useCallback(
    (category: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (prev.get("category") === category) {
          next.delete("category");
        } else {
          next.set("category", category);
        }
        next.delete("page");
        return next;
      });
    },
    [setSearchParams],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 1 || newPage > totalPages || newPage === currentPage) {
        return;
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (newPage === 1) {
          next.delete("page");
        } else {
          next.set("page", String(newPage));
        }
        return next;
      });
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [totalPages, currentPage, setSearchParams],
  );

  useEffect(() => {
    let ignore = false;
    setPopularSpots(null);
    setPopularSpotsError(false);

    searchSpots({
      category: selectedCategory ?? undefined,
      region: GANGWON_REGION_CODE,
      sigungu: selectedRegion ? sigunguCodeByRegion[selectedRegion] : undefined,
      sort: isDiscoverMode ? "latest" : "popular",
      size: PAGE_SIZE,
      offset: (currentPage - 1) * PAGE_SIZE,
    })
      .then((response) => {
        if (!ignore) {
          setPopularSpots(response.items);
          setTotalCount(response.totalCount);
          const nextLiked: Record<number, boolean> = {};
          for (const spot of response.items) {
            if (spot.isLiked !== undefined) {
              nextLiked[spot.spotId] = spot.isLiked;
            }
          }
          setLikedSpots((prev) => ({ ...prev, ...nextLiked }));
        }
      })
      .catch(() => {
        if (!ignore) {
          setPopularSpotsError(true);
        }
      });

    // 위시리스트에 담긴 전체 스팟 목록도 함께 동기화
    fetchLikedSpots()
      .then((likedList) => {
        if (!ignore && likedList) {
          const likedMap: Record<number, boolean> = {};
          for (const item of likedList) {
            likedMap[item.spotId] = true;
          }
          setLikedSpots((prev) => ({ ...prev, ...likedMap }));
        }
      })
      .catch(() => {
        // 비로그인 상태일 땐 무시
      });

    return () => {
      ignore = true;
    };
  }, [selectedRegion, selectedCategory, currentPage, isDiscoverMode, spotsReload]);

  const handleToggleLike = async (event: React.MouseEvent, spotId: number) => {
    event.preventDefault();
    event.stopPropagation();

    if (loadingSpots[spotId]) {
      return;
    }

    const currentSpot = popularSpots?.find((s) => s.spotId === spotId);
    const isCurrentlyLiked =
      likedSpots[spotId] !== undefined ? likedSpots[spotId] : !!currentSpot?.isLiked;

    const nextLiked = !isCurrentlyLiked;
    setLikedSpots((prev) => ({ ...prev, [spotId]: nextLiked }));
    setLoadingSpots((prev) => ({ ...prev, [spotId]: true }));

    try {
      const result = isCurrentlyLiked ? await unlikeSpot(spotId) : await likeSpot(spotId);
      setLikedSpots((prev) => ({ ...prev, [spotId]: result.liked }));
    } catch (error) {
      setLikedSpots((prev) => ({ ...prev, [spotId]: isCurrentlyLiked }));
      if (error instanceof UnauthorizedError) {
        alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
        navigate("/login");
      }
    } finally {
      setLoadingSpots((prev) => ({ ...prev, [spotId]: false }));
    }
  };

  const handleGoBack = () => {
    navigate("/main");
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground md:pb-16 md:pt-16">
      <AppNav />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8 md:pb-0 md:pt-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGoBack}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label="뒤로 가기"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRegionMapOpen(true)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3.5 py-1.5 text-xs font-semibold transition-colors hover:bg-muted sm:text-sm"
              aria-label={`여행 지역 선택: ${locationName}`}
              aria-haspopup="dialog"
              aria-expanded={isRegionMapOpen}
            >
              <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>{selectedRegion ?? "전체 지역"}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
            {selectedRegion ? (
              <button
                type="button"
                onClick={handleClearRegion}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:h-8 sm:w-8"
                aria-label="지역 필터 해제 (전체 보기)"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pt-8 sm:px-8 md:pt-6 lg:px-10">
        <div
          role="group"
          aria-label="카테고리 필터"
          className="mb-6 flex gap-2 overflow-x-auto pb-1"
        >
          <button
            type="button"
            onClick={() => {
              if (selectedCategory) {
                handleToggleCategory(selectedCategory);
              }
            }}
            aria-pressed={selectedCategory === null}
            className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
              selectedCategory === null
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-foreground hover:bg-muted"
            }`}
          >
            전체
          </button>
          {SPOT_CATEGORY_OPTIONS.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => handleToggleCategory(category)}
              aria-pressed={selectedCategory === category}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                selectedCategory === category
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/50 text-foreground hover:bg-muted"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {popularSpots === null && !popularSpotsError ? (
          <div className="flex justify-center py-24">
            <LoaderFour text={isDiscoverMode ? "여행 장소를 불러오는 중..." : "인기 장소를 불러오는 중..."} />
          </div>
        ) : popularSpotsError ? (
          <div role="alert" className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="text-base text-muted-foreground">
              {isDiscoverMode ? "여행 장소를 불러오지 못했습니다." : "인기 장소를 불러오지 못했습니다."}
            </p>
            <button
              type="button"
              onClick={() => setSpotsReload((value) => value + 1)}
              aria-label={isDiscoverMode ? "여행 장소 다시 시도" : "인기 장소 다시 시도"}
              className="rounded-lg border border-border px-3 py-2 font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              다시 시도
            </button>
          </div>
        ) : popularSpots?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-base text-muted-foreground">
              {isDiscoverMode ? "추천할 여행 장소가 없어요." : "표시할 인기 장소가 없어요."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {(popularSpots ?? []).map((spot) => {
                const isLiked =
                  likedSpots[spot.spotId] !== undefined
                    ? likedSpots[spot.spotId]
                    : !!spot.isLiked;
                const isLoading = !!loadingSpots[spot.spotId];

                return (
                  <Link
                    key={spot.spotId}
                    to={`/spots/${spot.spotId}`}
                    className="group block overflow-hidden rounded-lg border bg-background shadow-panel transition-all duration-200 hover:shadow-md"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden">
                      <img
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        src={spot.thumbnail ?? FALLBACK_SPOT_IMAGE}
                        alt={spot.title}
                      />
                      <span className="absolute left-2.5 top-2.5 rounded-full bg-background/95 px-2.5 py-1 text-xs font-medium shadow sm:left-3 sm:top-3 sm:px-3 sm:py-1.5">
                        {spot.category}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => handleToggleLike(event, spot.spotId)}
                        disabled={isLoading}
                        className="absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-all hover:bg-black/60 active:scale-90 disabled:opacity-60 sm:right-3 sm:top-3"
                        aria-pressed={isLiked}
                        aria-label={isLiked ? `${spot.title} 좋아요 취소` : `${spot.title} 좋아요`}
                      >
                        <Heart
                          className={`h-4.5 w-4.5 transition-colors ${
                            isLiked ? "fill-rose-500 text-rose-500" : "text-white/90"
                          }`}
                          strokeWidth={2}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    <div className="p-3 sm:p-4">
                      <h2 className="truncate text-sm font-semibold sm:text-base">{spot.title}</h2>
                    </div>
                  </Link>
                );
              })}
            </div>

            {totalPages > 1 && (
              <nav aria-label="페이지네이션" className="mt-10 flex items-center justify-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10"
                  aria-label="이전 페이지"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>

                {pageNumbers.map((pageNum) => {
                  const isCurrent = pageNum === currentPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => handlePageChange(pageNum)}
                      className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors sm:h-10 sm:min-w-10 sm:px-3.5 ${
                        isCurrent
                          ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                          : "border border-border bg-background text-foreground hover:bg-muted"
                      }`}
                      aria-current={isCurrent ? "page" : undefined}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10"
                  aria-label="다음 페이지"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </main>

      <GangwonRegionMap
        open={isRegionMapOpen}
        selectedRegion={selectedRegion}
        onClose={closeRegionMap}
        onSelect={handleSelectRegion}
      />
    </div>
  );
}
