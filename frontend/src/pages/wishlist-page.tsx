import { CourseAccessError } from "@/lib/course-errors";
import { formatCourseDuration } from "@/lib/course-duration";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Compass,
  Eye,
  Heart,
  Loader2,
  MapPin,
  MessageSquare,
  Route,
} from "lucide-react";
import { MISSING_SPOT_ADDRESS } from "@/lib/spot-display";
import SpotImage from "@/components/ui/spot-image";
import AppNav from "@/components/ui/app-nav";
import { unlikeSpot, UnauthorizedError } from "@/services/spots";
import { unlikeCourse, CourseResponse } from "@/services/course";
import { unlikeBoard, BoardDetail } from "@/services/board";
import {
  fetchLikedSpots,
  fetchLikedCourses,
  fetchLikedBoards,
  WishlistSpot,
} from "@/services/wishlist";

type TabType = "spots" | "courses" | "boards";

const WISHLIST_CATEGORIES = [
  { id: "spots", label: "여행지", description: "가고 싶은 장소", icon: Compass },
  { id: "courses", label: "여행 코스", description: "따라가고 싶은 일정", icon: Route },
  { id: "boards", label: "여행 후기", description: "다시 읽고 싶은 순간", icon: BookOpen },
] as const;

export default function WishlistPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab: TabType = requestedTab === "courses" || requestedTab === "boards"
    ? requestedTab
    : "spots";
  const setActiveTab = (tab: TabType) => {
    if (tab === activeTab) return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", tab);
      return next;
    });
  };

  const [spots, setSpots] = useState<WishlistSpot[]>([]);
  const [courses, setCourses] = useState<CourseResponse[]>([]);
  const [boards, setBoards] = useState<BoardDetail[]>([]);
  const [unlikingBoardIds, setUnlikingBoardIds] = useState<number[]>([]);
  const [storyLikeError, setStoryLikeError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    let latestRequest = 0;
    const loadAllWishlist = async () => {
      const request = ++latestRequest;
      const isCurrent = () => !ignore && request === latestRequest;
      try {
        const [spotsRes, coursesRes, boardsRes] = await Promise.all([
          fetchLikedSpots(),
          fetchLikedCourses(),
          fetchLikedBoards(),
        ]);

        if (isCurrent()) {
          setError(null);
          setSpots(spotsRes);
          setCourses(coursesRes);
          setBoards(boardsRes);
        }
      } catch (err) {
        if (!isCurrent()) return;
        if (err instanceof UnauthorizedError) {
          alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
          navigate("/login");
          return;
        }
        if (isCurrent()) {
          setError(
            err instanceof Error ? err.message : "위시리스트를 불러오지 못했습니다."
          );
        }
      } finally {
        if (isCurrent()) {
          setLoading(false);
        }
      }
    };

    void loadAllWishlist();
    const revalidate = () => { if (document.visibilityState === "visible") void loadAllWishlist(); };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      ignore = true;
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [navigate]);

  const handleUnlikeSpot = async (e: React.MouseEvent, spotId: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await unlikeSpot(spotId);
      setSpots((prev) => prev.filter((s) => s.spotId !== spotId));
    } catch {
      alert("좋아요 취소에 실패했습니다.");
    }
  };

  const handleUnlikeCourse = async (e: React.MouseEvent, courseId: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await unlikeCourse(courseId);
      setCourses((prev) => prev.filter((c) => c.courseId !== courseId));
    } catch (error) {
      if (error instanceof CourseAccessError) {
        setCourses((prev) => prev.filter((course) => course.courseId !== courseId));
        alert(error.message);
      } else if (error instanceof UnauthorizedError) {
        navigate("/login");
      } else {
        alert("좋아요 취소에 실패했습니다.");
      }
    }
  };

  const handleUnlikeBoard = async (e: React.MouseEvent, boardId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (unlikingBoardIds.includes(boardId)) return;
    setUnlikingBoardIds((prev) => [...prev, boardId]);
    setStoryLikeError(null);
    try {
      await unlikeBoard(boardId);
      setBoards((prev) => prev.filter((b) => b.boardId !== boardId));
    } catch {
      setStoryLikeError("여행 후기 좋아요를 취소하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setUnlikingBoardIds((prev) => prev.filter((id) => id !== boardId));
    }
  };

  const counts = { spots: spots.length, courses: courses.length, boards: boards.length };
  const activeCategory = WISHLIST_CATEGORIES.find((category) => category.id === activeTab)!;
  const totalCount = spots.length + courses.length + boards.length;

  return (
    <div className="min-h-screen bg-background pb-28 sm:pb-32 md:pb-16 md:pt-16">
      <AppNav />

      <main className="mx-auto max-w-7xl px-5 pt-7 sm:px-8 sm:pt-10 lg:px-10">
        {/* 상단 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/main" className="hover:text-foreground">
            홈
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">위시리스트</span>
        </div>

        <header className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Heart aria-hidden="true" className="h-5 w-5" />
              </div>
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground sm:text-[30px]">
                위시리스트
              </h1>
            </div>
            <p className="mt-3 break-keep text-[13px] leading-6 text-muted-foreground sm:text-sm">
              마음에 담은 여행지부터 후기까지, 다음 여행의 설렘을 모아보세요.
            </p>
          </div>
          {!loading && !error && (
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/[0.07] px-3.5 py-2 text-xs font-medium text-primary sm:text-[13px]">
              <Heart aria-hidden="true" className="h-3.5 w-3.5" />
              총 {totalCount.toLocaleString("ko-KR")}개 담았어요
            </span>
          )}
        </header>

        {/* 모든 화면 크기에서 세 분류를 한눈에 보고 전환할 수 있다. */}
        <div role="group" aria-label="좋아요 종류" className="mt-6 grid grid-cols-3 gap-2 rounded-[24px] bg-primary/[0.04] p-2 sm:mt-7 sm:gap-3 sm:p-3">
          {WISHLIST_CATEGORIES.map(({ id, label, description, icon: Icon }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-label={`${label} ${loading ? "불러오는 중" : error ? "개수 확인 불가" : `${counts[id]}개`}`}
                aria-pressed={selected}
                aria-controls="wishlist-content"
                className={`relative flex min-w-0 flex-col items-center justify-center gap-2.5 rounded-[18px] border-2 px-1.5 py-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none md:flex-row md:justify-start md:gap-3 md:px-4 md:py-5 md:text-left lg:gap-4 lg:px-5 ${
                  selected
                    ? "border-primary bg-background shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.3)]"
                    : "border-transparent bg-background/60 hover:border-primary/25 hover:bg-background"
                }`}
              >
                <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11 sm:rounded-2xl ${selected ? "bg-primary text-primary-foreground" : "bg-primary/[0.08] text-primary"}`}>
                  <Icon aria-hidden="true" className="h-5 w-5 sm:h-[22px] sm:w-[22px]" strokeWidth={1.8} />
                  {selected && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background text-primary ring-2 ring-primary sm:h-[18px] sm:w-[18px]">
                      <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block whitespace-nowrap text-xs font-bold min-[375px]:text-[13px] sm:text-[15px] lg:text-[17px] ${selected ? "text-primary" : "text-foreground"}`}>
                    {label}
                  </span>
                  <span className="mt-1 hidden text-xs leading-5 text-muted-foreground lg:block">{description}</span>
                </span>
                <span aria-hidden="true" className={`inline-flex min-h-6 min-w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums md:ml-auto sm:min-h-7 sm:min-w-8 sm:text-sm ${selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {loading ? "…" : error ? "—" : counts[id].toLocaleString("ko-KR")}
                </span>
              </button>
            );
          })}
        </div>

        <section id="wishlist-content" aria-labelledby="wishlist-content-title" aria-busy={loading} className="mt-7 sm:mt-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 id="wishlist-content-title" aria-live="polite" aria-atomic="true" className="flex items-center gap-2 text-base font-bold tracking-tight text-foreground sm:text-lg">
              담아둔 {activeCategory.label}
              {!loading && !error && <span className="text-primary">{counts[activeTab].toLocaleString("ko-KR")}</span>}
            </h2>
            <p className="text-xs text-muted-foreground">{activeCategory.description} 한눈에 보기</p>
          </div>

          {/* 컨텐츠 영역 */}
          {loading ? (
            <div role="status" className="flex h-64 flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                위시리스트를 불러오는 중입니다...
              </p>
            </div>
          ) : error ? (
            <div role="alert" className="mt-8 rounded-2xl border border-destructive/20 bg-background px-6 py-12 text-center">
              <p className="text-base font-semibold text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 min-h-11 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <div>
              {/* 1. 여행지/스팟 탭 */}
              {activeTab === "spots" && (
                <div>
                  {spots.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/[0.025] px-6 py-14 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Compass className="h-7 w-7" />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">
                        좋아요한 여행지가 없습니다.
                      </h3>
                      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                        강원도의 인기 명소와 숨은 핫플레이스를 둘러보고 마음에 드는 곳을 찜해보세요!
                      </p>
                      <div className="mt-6 flex justify-center">
                        <Link
                          to="/spots/popular"
                          className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                        >
                          인기 장소 둘러보기
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
                      {spots.map((spot) => (
                        <Link
                          key={spot.spotId}
                          to={`/spots/${spot.spotId}`}
                          data-testid={`wishlist-spot-${spot.spotId}`}
                          className="group relative flex min-w-0 flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                        >
                          <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted">
                            <SpotImage
                              src={spot.thumbnail}
                              alt={spot.title}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                            />
                            <button
                              type="button"
                              onClick={(e) => handleUnlikeSpot(e, spot.spotId)}
                              aria-label={`${spot.title} 여행지 좋아요 취소`}
                              title="여행지 좋아요 취소"
                              className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <Heart className="h-[18px] w-[18px] fill-current" />
                            </button>
                            <div className="absolute left-3 top-3 max-w-[calc(100%_-_4.5rem)]">
                              <span className="block truncate rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-medium text-zinc-800">
                                여행지 · {spot.category}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-1 flex-col justify-between px-0.5 pb-1 pt-3">
                            <div>
                              <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                                {spot.title}
                              </h3>
                              <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-muted-foreground">
                                {spot.address?.trim() || MISSING_SPOT_ADDRESS}
                              </p>
                            </div>
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {[spot.region, spot.sigungu].filter(Boolean).join(" ")}
                              </span>
                              <span className="flex items-center gap-1">
                                <Heart className="h-3.5 w-3.5" />
                                {spot.likeCount}
                              </span>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. 여행 코스 탭 */}
              {activeTab === "courses" && (
                <div>
                  {courses.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/[0.025] px-6 py-14 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Route className="h-7 w-7" />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">
                        좋아요한 여행 코스가 없습니다.
                      </h3>
                      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                        다른 여행자들의 멋진 코스를 구경하고 마음에 드는 일정을 담아보세요!
                      </p>
                      <div className="mt-6 flex justify-center">
                        <Link
                          to="/courses/public"
                          className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                        >
                          여행 코스 둘러보기
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      {courses.map((course) => {
                        const totalSpots = course.days.reduce(
                          (sum, day) => sum + day.spots.length,
                          0
                        );
                        return (
                          <Link
                            key={course.courseId}
                            to={`/courses/${course.courseId}`}
                            data-testid={`wishlist-course-${course.courseId}`}
                            className="group relative flex min-w-0 flex-col justify-between rounded-2xl border border-border/80 bg-background p-5 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                                  여행 코스 · {formatCourseDuration(course.days.length)}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleUnlikeCourse(e, course.courseId)}
                                  aria-label={`${course.title} 여행 코스 좋아요 취소`}
                                  title="여행 코스 좋아요 취소"
                                  className="flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                  <Heart className="h-[18px] w-[18px] fill-current" />
                                </button>
                              </div>

                              <h3 className="mt-3 line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                                {course.title}
                              </h3>

                              {course.description && (
                                <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                                  {course.description}
                                </p>
                              )}
                            </div>

                            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground">
                              <div className="flex items-center gap-3">
                                {course.startDate && course.endDate ? (
                                  <span className="flex items-center gap-1 truncate">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {course.startDate.substring(5)} ~{" "}
                                    {course.endDate.substring(5)}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3.5 w-3.5" />
                                    {totalSpots}개 장소
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2.5">
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3.5 w-3.5" />
                                  {course.viewCount}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Heart className="h-3.5 w-3.5" />
                                  {course.likeCount}
                                </span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 3. 여행 후기 탭 */}
              {activeTab === "boards" && (
                <div>
                  {storyLikeError && (
                    <p role="alert" className="mb-4 text-sm text-destructive">
                      {storyLikeError}
                    </p>
                  )}
                  {boards.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-primary/20 bg-primary/[0.025] px-6 py-14 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <BookOpen className="h-7 w-7" />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">
                        좋아요한 여행 후기가 없습니다.
                      </h3>
                      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                        여행 후기의 좋아요 버튼을 누르면 이곳에 따로 모아볼 수 있어요.
                      </p>
                      <div className="mt-6 flex justify-center">
                        <Link
                          to="/main"
                          className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                        >
                          여행 후기 둘러보기
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
                      {boards.map((board) => (
                        <article
                          key={board.boardId}
                          data-testid={`wishlist-board-${board.boardId}`}
                          className="group relative flex min-w-0 flex-col"
                        >
                          <Link
                            to={`/boards/${board.boardId}`}
                            aria-label={`${board.title} 여행 후기 읽기`}
                            className="flex min-w-0 flex-1 flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                          >
                            <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted">
                              {board.thumbnail ? (
                                <img
                                  src={board.thumbnail}
                                  alt={board.title}
                                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-muted/80 text-muted-foreground">
                                  <BookOpen className="h-8 w-8 stroke-[1.5]" />
                                </div>
                              )}
                            </div>

                            <div className="flex flex-1 flex-col justify-between px-0.5 pb-1 pt-3">
                              <div>
                                <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                                  <BookOpen aria-hidden="true" className="h-3 w-3" />
                                  여행 후기
                                </span>
                                <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                                  {board.title}
                                </h3>
                                <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                                  {board.content.replace(/<[^>]*>?/gm, "").slice(0, 100)}
                                </p>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-xs text-muted-foreground">
                                <span className="text-xs">
                                  {board.createdAt.substring(0, 10)}
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="flex items-center gap-1">
                                    <Eye className="h-3.5 w-3.5" />
                                    {board.viewCount}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Heart className="h-3.5 w-3.5" />
                                    {board.likeCount}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <MessageSquare className="h-3.5 w-3.5" />
                                    {board.commentCount}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => handleUnlikeBoard(e, board.boardId)}
                            aria-label={`${board.title} 여행 후기 좋아요 취소`}
                            aria-pressed="true"
                            disabled={unlikingBoardIds.includes(board.boardId)}
                            title="여행 후기 좋아요 취소"
                            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70"
                          >
                            {unlikingBoardIds.includes(board.boardId) ? (
                              <Loader2 aria-hidden="true" className="h-[18px] w-[18px] animate-spin" />
                            ) : (
                              <Heart aria-hidden="true" className="h-[18px] w-[18px] fill-current" />
                            )}
                          </button>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
