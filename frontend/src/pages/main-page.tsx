import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MessageSquare,
  MapPin,
  Route,
} from "lucide-react";

import "./main-page.css";

import AppNav from "@/components/ui/app-nav";
import MainCourseCard from "@/components/ui/main-course-card";
import MainSpotCard from "@/components/ui/main-spot-card";
import MainTravelHeader from "@/components/ui/main-travel-header";
import StoryLikeButton from "@/components/ui/story-like-button";
import GangwonRegionMap, {
  sigunguCodeByRegion,
  type GangwonRegion,
} from "@/components/ui/gangwon-region-map";
import {
  fetchPopularBoards,
  likeBoard,
  unlikeBoard,
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
import { fetchPublicCourses, likeCourse, unlikeCourse, type PublicCourseItem } from "@/services/course";
import { fetchLikedBoards, fetchLikedCourses, fetchLikedSpots } from "@/services/wishlist";

// 강원도 전체가 시도코드 "51"(강원특별자치도) 하나뿐이라 상수로 둔다.
const GANGWON_REGION_CODE = "51";
const FALLBACK_SPOT_IMAGE =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=85";

function PlaceCarouselControls({
  label,
  canScrollLeft,
  canScrollRight,
  onPrevious,
  onNext,
}: {
  label: string;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const buttonClass = "travel-carousel-button flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-25";

  return (
    <div role="group" aria-label={`${label} 넘기기`} className="flex shrink-0 gap-2">
      <button type="button" onClick={onPrevious} disabled={!canScrollLeft} className={buttonClass} aria-label={`이전 ${label} 보기`}>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" onClick={onNext} disabled={!canScrollRight} className={buttonClass} aria-label={`다음 ${label} 보기`}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function MainPage() {
  const navigate = useNavigate();
  const [selectedRegion, setSelectedRegion] = useState<GangwonRegion | null>(null);
  const [isRegionMapOpen, setIsRegionMapOpen] = useState(false);
  const locationName = selectedRegion ?? "강원도";

  const closeRegionMap = useCallback(() => setIsRegionMapOpen(false), []);
  const selectRegion = useCallback((region: GangwonRegion) => {
    setSelectedRegion(region);
    setIsRegionMapOpen(false);
  }, []);

  const guideCarouselRef = useRef<HTMLDivElement>(null);
  const [guideCourses, setGuideCourses] = useState<PublicCourseItem[] | null>(null);
  const [guideCoursesError, setGuideCoursesError] = useState(false);
  const [courseReload, setCourseReload] = useState(0);
  const [likedCourses, setLikedCourses] = useState<Record<number, boolean>>({});
  const [loadingCourses, setLoadingCourses] = useState<Record<number, boolean>>({});
  const [courseLikesLoading, setCourseLikesLoading] = useState(true);
  const [courseLikesError, setCourseLikesError] = useState(false);
  const [courseLikeError, setCourseLikeError] = useState<string | null>(null);
  const pendingCourseLikes = useRef(new Set<number>());
  const [canGuideScrollLeft, setCanGuideScrollLeft] = useState(false);
  const [canGuideScrollRight, setCanGuideScrollRight] = useState(false);

  const carouselRef = useRef<HTMLDivElement>(null);
  const [popularSpots, setPopularSpots] = useState<PopularSpot[] | null>(null);
  const [popularSpotsError, setPopularSpotsError] = useState(false);
  const [spotsReload, setSpotsReload] = useState(0);
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
  const [likedBoards, setLikedBoards] = useState<Record<number, boolean>>({});
  const [loadingBoards, setLoadingBoards] = useState<Record<number, boolean>>({});
  const [boardLikesLoading, setBoardLikesLoading] = useState(true);
  const [boardLikesError, setBoardLikesError] = useState(false);
  const [boardLikeError, setBoardLikeError] = useState<string | null>(null);
  const [boardLikesReload, setBoardLikesReload] = useState(0);
  const pendingBoardLikes = useRef(new Set<number>());
  const [canBoardScrollLeft, setCanBoardScrollLeft] = useState(false);
  const [canBoardScrollRight, setCanBoardScrollRight] = useState(false);

  const updateGuideScrollButtons = useCallback(() => {
    const el = guideCarouselRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanGuideScrollLeft(scrollLeft > 1);
    setCanGuideScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

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

    setGuideCourses(null);
    setGuideCoursesError(false);
    setCourseLikesLoading(true);
    setCourseLikesError(false);
    setCourseLikeError(null);

    // 공개 코스 API는 시·군 필터를 지원하지 않으므로 전체 공개 코스를 조회한다.
    fetchPublicCourses({ sort: "latest", size: 20 })
      .then((res) => {
        if (!ignore) {
          setGuideCourses(res.items);
        }
      })
      .catch(() => {
        if (!ignore) {
          setGuideCoursesError(true);
        }
      });

    // 공개 목록에는 isLiked가 없으므로 계정의 코스 위시리스트에서 확인한다.
    fetchLikedCourses()
      .then((courses) => {
        if (!ignore) {
          setLikedCourses(Object.fromEntries(courses.map((course) => [course.courseId, true])));
        }
      })
      .catch((error) => {
        if (ignore) return;
        if (error instanceof UnauthorizedError) {
          setLikedCourses({});
        } else {
          setCourseLikesError(true);
        }
      })
      .finally(() => {
        if (!ignore) setCourseLikesLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [courseReload]);

  useEffect(() => {
    let ignore = false;

    setPopularSpots(null);
    setPopularSpotsError(false);

    fetchPopularSpots({
      region: GANGWON_REGION_CODE,
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
  }, [selectedRegion, spotsReload]);

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

    fetchPopularBoards({ size: 6 })
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
    let ignore = false;
    setBoardLikesLoading(true);
    setBoardLikesError(false);

    // 공개 이야기 목록에는 isLiked가 없으므로 계정의 이야기 위시리스트로 확인한다.
    fetchLikedBoards()
      .then((boards) => {
        if (!ignore) {
          setLikedBoards(Object.fromEntries(boards.map((board) => [board.boardId, true])));
        }
      })
      .catch((error) => {
        if (ignore) return;
        if (error instanceof UnauthorizedError) {
          setLikedBoards({});
        } else {
          setBoardLikesError(true);
        }
      })
      .finally(() => {
        if (!ignore) setBoardLikesLoading(false);
      });

    return () => { ignore = true; };
  }, [boardLikesReload]);

  useEffect(() => {
    updateGuideScrollButtons();
    const handleResize = () => updateGuideScrollButtons();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [guideCourses, updateGuideScrollButtons]);

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

  const handleGuideScroll = (direction: -1 | 1) => {
    if (!guideCarouselRef.current) return;
    const scrollAmount = Math.max(200, Math.floor(guideCarouselRef.current.clientWidth * 0.6));
    if (typeof guideCarouselRef.current.scrollBy === "function") {
      guideCarouselRef.current.scrollBy({ left: direction * scrollAmount, behavior: "smooth" });
    } else {
      guideCarouselRef.current.scrollLeft += direction * scrollAmount;
      updateGuideScrollButtons();
    }
  };

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
    }
  };

  const handleBoardScrollRight = () => {
    if (!boardCarouselRef.current) return;
    const scrollAmount = Math.max(200, Math.floor(boardCarouselRef.current.clientWidth * 0.6));
    if (typeof boardCarouselRef.current.scrollBy === "function") {
      boardCarouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    } else {
      boardCarouselRef.current.scrollLeft += scrollAmount;
    }
  };

  const handleToggleLike = async (event: React.MouseEvent, spotId: number) => {
    event.preventDefault();
    event.stopPropagation();

    if (loadingSpots[spotId]) {
      return;
    }

    const currentSpot = popularSpots?.find((spot) => spot.spotId === spotId);
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

  const handleToggleCourseLike = async (event: React.MouseEvent, courseId: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (courseLikesLoading || courseLikesError || pendingCourseLikes.current.has(courseId)) return;

    const wasLiked = !!likedCourses[courseId];
    pendingCourseLikes.current.add(courseId);
    setCourseLikeError(null);
    setLikedCourses((prev) => ({ ...prev, [courseId]: !wasLiked }));
    setLoadingCourses((prev) => ({ ...prev, [courseId]: true }));
    try {
      const result = wasLiked ? await unlikeCourse(courseId) : await likeCourse(courseId);
      setLikedCourses((prev) => ({ ...prev, [courseId]: result.liked }));
    } catch (error) {
      setLikedCourses((prev) => ({ ...prev, [courseId]: wasLiked }));
      if (error instanceof UnauthorizedError) {
        navigate("/login");
      } else {
        setCourseLikeError("코스 찜을 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      pendingCourseLikes.current.delete(courseId);
      setLoadingCourses((prev) => ({ ...prev, [courseId]: false }));
    }
  };

  const handleToggleBoardLike = async (boardId: number) => {
    if (boardLikesLoading || boardLikesError || pendingBoardLikes.current.has(boardId)) return;

    const wasLiked = !!likedBoards[boardId];
    pendingBoardLikes.current.add(boardId);
    setBoardLikeError(null);
    setLoadingBoards((prev) => ({ ...prev, [boardId]: true }));

    try {
      const result = wasLiked ? await unlikeBoard(boardId) : await likeBoard(boardId);
      setLikedBoards((prev) => ({ ...prev, [boardId]: result.liked }));
      setPopularBoards((prev) => prev?.map((board) => (
        board.boardId === boardId ? { ...board, likeCount: result.likeCount } : board
      )) ?? prev);
    } catch (error) {
      if (error instanceof UnauthorizedError || (error instanceof Error && error.message === "로그인이 필요합니다.")) {
        navigate("/login");
      } else {
        setBoardLikeError("이야기 좋아요를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      pendingBoardLikes.current.delete(boardId);
      setLoadingBoards((prev) => ({ ...prev, [boardId]: false }));
    }
  };

  return (
    <div className="travel-home min-h-screen bg-background pb-28 text-foreground md:pb-0 md:pt-16">
      <main>
        <MainTravelHeader
          selectedRegion={selectedRegion}
          isRegionMapOpen={isRegionMapOpen}
          onOpenRegions={() => setIsRegionMapOpen(true)}
          onSelectRegion={setSelectedRegion}
          weatherList={weatherList}
          weatherLoading={weatherLoading}
          weatherError={weatherError}
        />

        <section className="travel-section travel-section-courses mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10 lg:px-10" aria-labelledby="discover-title">
          <div className="flex items-center justify-between gap-4">
            <div className="travel-section-title">
              <span className="travel-section-icon"><Route aria-hidden="true" /></span>
              <div>
                <p className="travel-eyebrow">FIND YOUR NEXT TRIP</p>
                <h2 id="discover-title" className="text-xl font-bold tracking-tight sm:text-2xl">강원도에서 뭐 하지?</h2>
              </div>
            </div>
            <Link
              to="/courses/public"
              className="travel-section-link inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm"
              aria-label="강원도에서 뭐 하지? 전체보기"
            >
              전체보기
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="travel-section-description mt-3 flex items-center justify-between gap-4">
            <p className="break-keep text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
              다른 여행자들이 공유한 코스로 여행을 계획해 보세요.
            </p>
            {!!guideCourses?.length && !guideCoursesError && (
              <PlaceCarouselControls
                label="여행 코스"
                canScrollLeft={canGuideScrollLeft}
                canScrollRight={canGuideScrollRight}
                onPrevious={() => handleGuideScroll(-1)}
                onNext={() => handleGuideScroll(1)}
              />
            )}
          </div>

          {courseLikeError && <p role="alert" className="mt-4 text-sm text-destructive">{courseLikeError}</p>}
          {courseLikesError && !guideCoursesError && !!guideCourses?.length && (
            <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <p>코스 찜 상태를 불러오지 못했습니다.</p>
              <button type="button" onClick={() => setCourseReload((value) => value + 1)} className="rounded-lg border border-border px-3 py-2 font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">찜 상태 다시 확인</button>
            </div>
          )}
          {guideCourses === null && !guideCoursesError ? (
            <div role="status" className="mt-6 flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground sm:h-72">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <span>여행 코스를 불러오는 중...</span>
            </div>
          ) : guideCoursesError ? (
            <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <p>여행 코스를 불러오지 못했습니다.</p>
              <button type="button" onClick={() => setCourseReload((value) => value + 1)} className="rounded-lg border border-border px-3 py-2 font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">다시 시도</button>
            </div>
          ) : (guideCourses?.length ?? 0) === 0 ? (
            <p className="mt-6 text-base text-muted-foreground">공개된 여행 코스가 아직 없어요.</p>
          ) : (
            <div className="mt-5">
              <div
                ref={guideCarouselRef}
                onScroll={updateGuideScrollButtons}
                className="travel-card-track -mx-1 flex snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto p-1 scrollbar-hide sm:gap-5"
                aria-label="여행 코스"
              >
                {(guideCourses ?? []).map((course) => (
                  <MainCourseCard
                    key={course.courseId}
                    course={course}
                    isLiked={!!likedCourses[course.courseId]}
                    isLoading={courseLikesLoading || !!loadingCourses[course.courseId]}
                    isLikeDisabled={courseLikesError}
                    onToggleLike={handleToggleCourseLike}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="travel-section travel-section-spots mx-auto max-w-7xl px-5 pb-12 sm:px-8 lg:px-10" aria-labelledby="popular-spots-title">
          <div className="flex items-center justify-between gap-4">
            <div className="travel-section-title">
              <span className="travel-section-icon travel-section-icon-mint"><MapPin aria-hidden="true" /></span>
              <div>
                <p className="travel-eyebrow">PLACES TO FALL IN LOVE WITH</p>
                <h2 id="popular-spots-title" className="text-xl font-bold tracking-tight sm:text-2xl">{locationName}의 인기 장소</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (selectedRegion) {
                  navigate(`/spots/popular?region=${encodeURIComponent(selectedRegion)}`);
                } else {
                  navigate("/spots/popular");
                }
              }}
              className="travel-section-link inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm"
              aria-label="인기 장소 더보기"
            >
              전체보기
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="travel-section-description mt-3 flex items-center justify-between gap-4">
            <p className="break-keep text-[13px] leading-relaxed text-muted-foreground sm:text-sm">여행자들이 많이 찾는 장소를 둘러보세요.</p>
            {!!popularSpots?.length && !popularSpotsError && (
              <PlaceCarouselControls
                label="인기 장소"
                canScrollLeft={canScrollLeft}
                canScrollRight={canScrollRight}
                onPrevious={handleScrollLeft}
                onNext={handleScrollRight}
              />
            )}
          </div>

          {popularSpots === null && !popularSpotsError ? (
            <div role="status" className="mt-6 flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground sm:h-72">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
              <span>{locationName} 인기 장소를 불러오는 중...</span>
            </div>
          ) : popularSpotsError ? (
            <div role="alert" className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <p>인기 장소를 불러오지 못했습니다.</p>
              <button
                type="button"
                onClick={() => setSpotsReload((value) => value + 1)}
                aria-label="인기 장소 다시 시도"
                className="rounded-lg border border-border px-3 py-2 font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                다시 시도
              </button>
            </div>
          ) : popularSpots?.length === 0 ? (
            <p className="mt-6 text-base text-muted-foreground">표시할 인기 장소가 없어요.</p>
          ) : (
            <div className="mt-5">
              <div
                ref={carouselRef}
                onScroll={updateScrollButtons}
                className="travel-card-track -mx-1 flex snap-x snap-mandatory scroll-px-1 gap-4 overflow-x-auto p-1 scrollbar-hide sm:gap-5"
                aria-label={`${locationName} 인기 장소`}
              >
                {(popularSpots ?? []).map((spot) => {
                  const isLiked =
                    likedSpots[spot.spotId] !== undefined
                      ? likedSpots[spot.spotId]
                      : !!spot.isLiked;
                  const isLoading = !!loadingSpots[spot.spotId];

                  return (
                    <MainSpotCard
                      key={spot.spotId}
                      spot={spot}
                      variant="popular"
                      isLiked={isLiked}
                      isLoading={isLoading}
                      onToggleLike={handleToggleLike}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="travel-section travel-section-stories mx-auto max-w-7xl px-5 pb-12 sm:px-8 lg:px-10" aria-labelledby="travel-stories-title">
          <div className="flex items-center justify-between gap-4">
            <div className="travel-section-title">
              <span className="travel-section-icon travel-section-icon-peach"><BookOpen aria-hidden="true" /></span>
              <div>
                <p className="travel-eyebrow">MOMENTS WORTH SHARING</p>
                <h2 id="travel-stories-title" className="text-xl font-bold tracking-tight sm:text-2xl">여행 이야기</h2>
              </div>
            </div>
            <Link
              to="/boards/create"
              className="travel-story-write inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:text-sm"
            >
              <span>이야기 올리기</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground sm:text-sm">마음에 드는 이야기에 좋아요를 누르면 위시리스트의 여행 이야기에서 다시 볼 수 있어요.</p>
          {boardLikeError && <p role="alert" className="mt-4 text-sm text-destructive">{boardLikeError}</p>}
          {boardLikesError && !popularBoardsError && !!popularBoards?.length && (
            <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <p>이야기 좋아요 상태를 불러오지 못했습니다.</p>
              <button type="button" onClick={() => setBoardLikesReload((value) => value + 1)} className="rounded-lg border border-border px-3 py-2 font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">좋아요 상태 다시 확인</button>
            </div>
          )}
          {popularBoards === null && !popularBoardsError ? (
            <div role="status" className="mt-6 flex h-44 items-center justify-center gap-2 text-sm text-muted-foreground sm:h-72">
              <Loader2 className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              <span>여행 이야기를 불러오는 중...</span>
            </div>
          ) : popularBoardsError || popularBoards?.length === 0 ? (
            <p className="mt-6 text-base text-muted-foreground">표시할 게시글이 없어요.</p>
          ) : (
            <div className="relative mt-6">
              {canBoardScrollLeft ? (
                <button
                  type="button"
                  onClick={handleBoardScrollLeft}
                  className="absolute left-2 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-all hover:scale-105 hover:bg-background active:scale-95 sm:left-3"
                  aria-label="이전 게시글 보기"
                >
                  <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </button>
              ) : null}

              <div
                ref={boardCarouselRef}
                onScroll={updateBoardScrollButtons}
                className="travel-card-track -mx-1 flex gap-4 overflow-x-auto p-1 snap-x snap-mandatory scrollbar-hide sm:gap-5"
              >
                {(popularBoards ?? []).map((board) => (
                  <article
                    key={board.boardId}
                    className="travel-story-card group block w-[82%] shrink-0 snap-start rounded-3xl sm:w-[46%] lg:w-[calc((100%_-_2.5rem)/3)]"
                  >
                    <Link
                      to={`/boards/${board.boardId}`}
                      className="block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    >
                      <div className="relative aspect-[16/10] overflow-hidden rounded-t-3xl bg-muted">
                        <img
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                          src={board.thumbnail ?? FALLBACK_SPOT_IMAGE}
                          alt={board.title}
                          loading="lazy"
                        />
                        <span className="travel-story-image-label"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" /> 여행 기록</span>
                      </div>
                      <div className="flex items-start gap-3 px-5 pb-4 pt-5">
                        <h3 className="line-clamp-2 flex-1 text-base font-bold leading-relaxed tracking-tight transition-colors group-hover:text-primary">{board.title}</h3>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      </div>
                    </Link>
                    <div className="mx-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pb-4 pt-3">
                      <StoryLikeButton
                        title={board.title}
                        isLiked={!!likedBoards[board.boardId]}
                        likeCount={board.likeCount}
                        isLoading={boardLikesLoading || !!loadingBoards[board.boardId]}
                        disabled={boardLikesError}
                        onClick={() => handleToggleBoardLike(board.boardId)}
                      />
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" aria-label={`댓글 ${board.commentCount}개`}>
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        {board.commentCount}
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              {canBoardScrollRight ? (
                <button
                  type="button"
                  onClick={handleBoardScrollRight}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-md backdrop-blur-sm transition-all hover:scale-105 hover:bg-background active:scale-95 sm:right-3"
                  aria-label="다음 게시글 보기"
                >
                  <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )}
        </section>
      </main>

      <footer className="travel-footer mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <Link to="/main" className="text-lg font-bold tracking-tight">Plan<span className="text-primary">Fix</span></Link>
        <p>설레는 발견부터, 나다운 여행까지.</p>
        <span className="travel-footer-note">YOUR TRIP, YOUR WAY.</span>
      </footer>

      <AppNav className="travel-nav" />

      <GangwonRegionMap
        open={isRegionMapOpen}
        selectedRegion={selectedRegion}
        onClose={closeRegionMap}
        onSelect={selectRegion}
      />
    </div>
  );
}
