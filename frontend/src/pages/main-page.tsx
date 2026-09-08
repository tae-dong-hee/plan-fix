import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Heart,
  Info,
  Loader2,
} from "lucide-react";

import TravelGuideCarousel from "@/components/ui/travel-guide-carousel";
import BoardCard from "@/components/ui/board-card";
import AppNav from "@/components/ui/app-nav";
import GangwonRegionMap, {
  sigunguCodeByRegion,
  type GangwonRegion,
} from "@/components/ui/gangwon-region-map";
import {
  fetchPopularBoards,
  type BoardItem,
} from "@/services/board";
import {
  fetchPopularSpots,
  likeSpot,
  unlikeSpot,
  UnauthorizedError,
  type PopularSpot,
} from "@/services/spots";
import {
  fetch5DayWeather,
  type WeatherDayItem,
} from "@/services/weather";
import { fetchLikedSpots } from "@/services/wishlist";

// 강원도 전체가 시도코드 "51"(강원특별자치도) 하나뿐이라 상수로 둔다.
const GANGWON_REGION_CODE = "51";
const FALLBACK_SPOT_IMAGE =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=85";


export default function MainPage() {
  const navigate = useNavigate();
  const [selectedRegion, setSelectedRegion] = useState<GangwonRegion | null>(null);
  const [isRegionMapOpen, setIsRegionMapOpen] = useState(false);
  const locationName = selectedRegion ?? "강원도";
  const locationLabel = selectedRegion
    ? `강원도 / ${selectedRegion}`
    : "강원도 / 지역 선택";

  const closeRegionMap = useCallback(() => setIsRegionMapOpen(false), []);
  const selectRegion = useCallback((region: GangwonRegion) => {
    setSelectedRegion(region);
    setIsRegionMapOpen(false);
  }, []);

  const carouselRef = useRef<HTMLDivElement>(null);
  const [popularSpots, setPopularSpots] = useState<PopularSpot[] | null>(null);
  const [popularSpotsError, setPopularSpotsError] = useState(false);
  const [likedSpots, setLikedSpots] = useState<Record<number, boolean>>({});
  const [loadingSpots, setLoadingSpots] = useState<Record<number, boolean>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const [weatherList, setWeatherList] = useState<WeatherDayItem[] | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState(false);

  const boardCarouselRef = useRef<HTMLDivElement>(null);
  const [popularBoards, setPopularBoards] = useState<BoardItem[] | null>(null);
  const [popularBoardsError, setPopularBoardsError] = useState(false);
  const [canBoardScrollLeft, setCanBoardScrollLeft] = useState(false);
  const [canBoardScrollRight, setCanBoardScrollRight] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = carouselRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  const updateBoardScrollButtons = useCallback(() => {
    const el = boardCarouselRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanBoardScrollLeft(scrollLeft > 1);
    setCanBoardScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    let ignore = false;

    setPopularSpots(null);
    setPopularSpotsError(false);

    fetchPopularSpots({
      region: selectedRegion ? GANGWON_REGION_CODE : undefined,
      sigungu: selectedRegion ? sigunguCodeByRegion[selectedRegion] : undefined,
      size: 20,
    })
      .then((res) => {
        if (!ignore) {
          setPopularSpots(res.items);
          const nextLiked: Record<number, boolean> = {};
          for (const spot of res.items) {
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
  }, [selectedRegion]);

  useEffect(() => {
    let ignore = false;

    setWeatherLoading(true);
    setWeatherError(false);

    fetch5DayWeather(selectedRegion)
      .then((items) => {
        if (!ignore) {
          setWeatherList(items);
        }
      })
      .catch(() => {
        if (!ignore) {
          setWeatherError(true);
        }
      })
      .finally(() => {
        if (!ignore) {
          setWeatherLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedRegion]);

  useEffect(() => {
    let ignore = false;

    setPopularBoards(null);
    setPopularBoardsError(false);

    fetchPopularBoards({ size: 20 })
      .then((res) => {
        if (!ignore) {
          setPopularBoards(res.items);
        }
      })
      .catch(() => {
        if (!ignore) {
          setPopularBoardsError(true);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const handleResize = () => updateScrollButtons();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [popularSpots, updateScrollButtons]);

  useEffect(() => {
    updateBoardScrollButtons();
    const handleResize = () => updateBoardScrollButtons();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [popularBoards, updateBoardScrollButtons]);

  const handleScrollLeft = () => {
    if (!carouselRef.current) return;
    const scrollAmount = Math.max(200, Math.floor(carouselRef.current.clientWidth * 0.6));
    if (typeof carouselRef.current.scrollBy === "function") {
      carouselRef.current.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    } else {
      carouselRef.current.scrollLeft -= scrollAmount;
    }
  };

  const handleScrollRight = () => {
    if (!carouselRef.current) return;
    const scrollAmount = Math.max(200, Math.floor(carouselRef.current.clientWidth * 0.6));
    if (typeof carouselRef.current.scrollBy === "function") {
      carouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    } else {
      carouselRef.current.scrollLeft += scrollAmount;
    }
  };

  const handleBoardScrollLeft = () => {
    if (!boardCarouselRef.current) return;
    const scrollAmount = Math.max(200, Math.floor(boardCarouselRef.current.clientWidth * 0.6));
    if (typeof boardCarouselRef.current.scrollBy === "function") {
      boardCarouselRef.current.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    } else {
      boardCarouselRef.current.scrollLeft -= scrollAmount;
      updateBoardScrollButtons();
    }
  };

  const handleBoardScrollRight = () => {
    if (!boardCarouselRef.current) return;
    const scrollAmount = Math.max(200, Math.floor(boardCarouselRef.current.clientWidth * 0.6));
    if (typeof boardCarouselRef.current.scrollBy === "function") {
      boardCarouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    } else {
      boardCarouselRef.current.scrollLeft += scrollAmount;
      updateBoardScrollButtons();
    }
  };

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

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground md:pb-0 md:pt-16">
      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-primary/15 via-primary/5 to-background">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-[70%] rounded-full bg-background/35 blur-2xl" />
          <div className="pointer-events-none absolute -left-20 top-24 h-36 w-[85%] rounded-full bg-primary/5 blur-2xl" />

          <div className="relative mx-auto max-w-6xl px-5 pb-8 pt-10 sm:px-8 lg:px-10 lg:pt-14">
            <button
              type="button"
              onClick={() => setIsRegionMapOpen(true)}
              className="flex items-center gap-3 text-3xl font-semibold tracking-tight sm:text-4xl"
              aria-label={`여행 지역 선택: ${locationLabel}`}
              aria-haspopup="dialog"
              aria-expanded={isRegionMapOpen}
            >
              {locationLabel}
              <ChevronDown className="h-6 w-6 stroke-[3]" aria-hidden="true" />
            </button>

            <section
              className="mt-8 rounded-lg border bg-background/95 px-3 py-6 shadow-panel sm:px-6 lg:px-8"
              aria-labelledby="weather-title"
            >
              <h1 id="weather-title" className="sr-only">
                {locationName} 주간 날씨
              </h1>
              {weatherLoading && !weatherList ? (
                <div className="flex h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span>{locationName} 날씨 정보를 불러오는 중...</span>
                </div>
              ) : weatherError && !weatherList ? (
                <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
                  <span>날씨 정보를 불러오지 못했습니다.</span>
                </div>
              ) : (
                <div className="grid grid-cols-5">
                  {(weatherList ?? []).map((weather, index) => {
                    const WeatherIcon = weather.icon;

                    return (
                      <article
                        key={weather.date}
                        className={`min-w-0 px-1 text-center sm:px-5 ${
                          index > 0 ? "border-l" : ""
                        }`}
                      >
                        <h2 className="whitespace-nowrap text-xs font-semibold sm:text-lg">
                          {weather.date} <span className="text-muted-foreground">({weather.day})</span>
                        </h2>
                        <WeatherIcon
                          className={`mx-auto mt-4 h-7 w-7 sm:mt-5 sm:h-10 sm:w-10 ${weather.iconClass}`}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        <p className="mt-3 whitespace-nowrap text-xs font-semibold sm:mt-4 sm:text-lg">
                          {weather.low}° / {weather.high}°
                        </p>
                        <p
                          className={`mt-2 text-sm font-semibold sm:text-base ${
                            weather.rainProb > 0 ? "text-blue-500" : "text-muted-foreground/70"
                          }`}
                        >
                          {weather.rainProb}%
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}

              <div className="mt-7 flex items-center justify-between gap-4 border-t pt-5">
                <p className="flex items-center gap-2 text-sm text-muted-foreground sm:text-base">
                  제공&nbsp; Open-Meteo
                  <Info className="h-4 w-4" aria-hidden="true" />
                </p>
              </div>
            </section>
          </div>
        </section>

        <TravelGuideCarousel locationName={locationName} />

        <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8 lg:px-10">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{locationName}의 인기 장소</h2>
            <button
              type="button"
              onClick={() => {
                if (selectedRegion) {
                  navigate(`/spots/popular?region=${encodeURIComponent(selectedRegion)}`);
                } else {
                  navigate("/spots/popular");
                }
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label="인기 장소 더보기"
            >
              <ArrowRight className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {popularSpotsError || popularSpots?.length === 0 ? (
            <p className="mt-6 text-base text-muted-foreground">표시할 인기 장소가 없어요.</p>
          ) : (
            <div className="relative mt-6">
              {canScrollLeft ? (
                <button
                  type="button"
                  onClick={handleScrollLeft}
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-all hover:scale-105 hover:bg-background active:scale-95 sm:left-3"
                  aria-label="이전 인기 장소 보기"
                >
                  <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </button>
              ) : null}

              <div
                ref={carouselRef}
                onScroll={updateScrollButtons}
                className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide sm:gap-4"
              >
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
                      className="block w-[42%] shrink-0 overflow-hidden rounded-lg border bg-background shadow-panel snap-start sm:w-56"
                    >
                      <div className="relative h-40 sm:h-56">
                        <img
                          className="h-full w-full object-cover"
                          src={spot.thumbnail ?? FALLBACK_SPOT_IMAGE}
                          alt={spot.title}
                        />
                        <span className="absolute left-3 top-3 rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium shadow sm:left-4 sm:top-4 sm:px-4 sm:py-2 sm:text-sm">
                          {spot.category}
                        </span>
                        <button
                          type="button"
                          onClick={(event) => handleToggleLike(event, spot.spotId)}
                          disabled={isLoading}
                          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-all hover:bg-black/60 active:scale-90 disabled:opacity-60"
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
                        <h3 className="truncate text-sm font-semibold sm:text-base">{spot.title}</h3>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {canScrollRight ? (
                <button
                  type="button"
                  onClick={handleScrollRight}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-all hover:scale-105 hover:bg-background active:scale-95 sm:right-3"
                  aria-label="다음 인기 장소 보기"
                >
                  <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )}
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-12 sm:px-8 lg:px-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">여행 이야기</h2>
            <div className="flex items-center gap-3">
              <Link
                to="/boards/create"
                className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground sm:text-sm"
              >
                이야기 올리기
              </Link>
              <Link
                to="/boards"
                aria-label="여행 이야기 전체보기"
                className="inline-flex items-center gap-1 rounded-md py-2 text-sm font-medium transition-colors hover:text-primary"
              >
                전체보기
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          {popularBoardsError ? (
            <p role="alert" className="mt-6 text-base text-muted-foreground">게시글을 불러오지 못했어요. 전체보기에서 다시 시도해 주세요.</p>
          ) : popularBoards === null ? (
            <div role="status" className="mt-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              여행 이야기를 불러오는 중이에요.
            </div>
          ) : popularBoards.length === 0 ? (
            <p className="mt-6 text-base text-muted-foreground">표시할 게시글이 없어요.</p>
          ) : (
            <div className="relative mt-6">
              <button
                type="button"
                onClick={handleBoardScrollLeft}
                disabled={!canBoardScrollLeft}
                className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background disabled:cursor-default disabled:opacity-35 sm:left-3 sm:h-12 sm:w-12"
                aria-label="이전 게시글 보기"
              >
                <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </button>

              <div
                ref={boardCarouselRef}
                onScroll={updateBoardScrollButtons}
                role="region"
                aria-label="여행 이야기 목록"
                tabIndex={0}
                className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide sm:gap-4"
              >
                {popularBoards.map((board) => (
                  <BoardCard
                    key={board.boardId}
                    board={board}
                    className="w-[42%] shrink-0 snap-start sm:w-56"
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleBoardScrollRight}
                disabled={!canBoardScrollRight}
                className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background disabled:cursor-default disabled:opacity-35 sm:right-3 sm:h-12 sm:w-12"
                aria-label="다음 게시글 보기"
              >
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
              </button>
            </div>
          )}
        </section>
      </main>

      <AppNav />

      <GangwonRegionMap
        open={isRegionMapOpen}
        selectedRegion={selectedRegion}
        onClose={closeRegionMap}
        onSelect={selectRegion}
      />
    </div>
  );
}
