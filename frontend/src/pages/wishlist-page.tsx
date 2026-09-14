import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calendar,
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

export default function WishlistPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>("spots");

  const [spots, setSpots] = useState<WishlistSpot[]>([]);
  const [courses, setCourses] = useState<CourseResponse[]>([]);
  const [boards, setBoards] = useState<BoardDetail[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    const loadAllWishlist = async () => {
      try {
        const [spotsRes, coursesRes, boardsRes] = await Promise.all([
          fetchLikedSpots(),
          fetchLikedCourses(),
          fetchLikedBoards(),
        ]);

        if (!ignore) {
          setSpots(spotsRes);
          setCourses(coursesRes);
          setBoards(boardsRes);
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
          navigate("/login");
          return;
        }
        if (!ignore) {
          setError(
            err instanceof Error ? err.message : "위시리스트를 불러오지 못했습니다."
          );
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadAllWishlist();

    return () => {
      ignore = true;
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
    } catch {
      alert("좋아요 취소에 실패했습니다.");
    }
  };

  const handleUnlikeBoard = async (e: React.MouseEvent, boardId: number) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await unlikeBoard(boardId);
      setBoards((prev) => prev.filter((b) => b.boardId !== boardId));
    } catch {
      alert("좋아요 취소에 실패했습니다.");
    }
  };

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

        {/* 헤더 */}
        <div className="mt-5 pb-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground">
              <Heart className="h-[18px] w-[18px]" />
            </div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground sm:text-[30px]">
              위시리스트
            </h1>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground sm:text-sm">
            내가 좋아요를 누른 여행지, 코스, 여행기 모음입니다.
          </p>
        </div>

        {/* 탭 네비게이션 */}
        <div className="mt-6 flex gap-5 overflow-x-auto border-b border-border/70 scrollbar-hide sm:gap-7">
          <button
            type="button"
            onClick={() => setActiveTab("spots")}
            className={`flex min-h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 pt-2 text-[13px] font-medium transition-colors ${
              activeTab === "spots"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Compass className="h-4 w-4" />
            <span>여행지 / 명소</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                activeTab === "spots"
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {spots.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("courses")}
            className={`flex min-h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 pt-2 text-[13px] font-medium transition-colors ${
              activeTab === "courses"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Route className="h-4 w-4" />
            <span>여행 코스</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                activeTab === "courses"
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {courses.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("boards")}
            className={`flex min-h-12 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 pb-3 pt-2 text-[13px] font-medium transition-colors ${
              activeTab === "boards"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            <span>여행기</span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                activeTab === "boards"
                  ? "bg-muted text-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {boards.length}
            </span>
          </button>
        </div>

        {/* 컨텐츠 영역 */}
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              위시리스트를 불러오는 중입니다...
            </p>
          </div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-destructive/20 bg-background px-6 py-12 text-center">
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
          <div className="mt-6">
            {/* 1. 여행지/스팟 탭 */}
            {activeTab === "spots" && (
              <div>
                {spots.length === 0 ? (
                  <div className="mt-6 rounded-2xl bg-muted/50 px-6 py-16 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-background text-muted-foreground">
                      <Compass className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 text-base font-semibold text-foreground">
                      좋아요한 여행지가 없습니다.
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                      강원도의 인기 명소와 숨은 핫플레이스를 둘러보고 마음에 드는 곳을 찜해보세요!
                    </p>
                    <div className="mt-6 flex justify-center">
                      <Link
                        to="/spots/popular"
                        className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
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
                            title="위시리스트에서 삭제"
                            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <Heart className="h-[18px] w-[18px] fill-current" />
                          </button>
                          <div className="absolute left-3 top-3 max-w-[calc(100%_-_4.5rem)]">
                            <span className="block truncate rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-medium text-zinc-800">
                              {spot.category}
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
                  <div className="mt-6 rounded-2xl bg-muted/50 px-6 py-16 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-background text-muted-foreground">
                      <Route className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 text-base font-semibold text-foreground">
                      좋아요한 여행 코스가 없습니다.
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                      다른 여행자들의 멋진 코스를 구경하고 마음에 드는 일정을 담아보세요!
                    </p>
                    <div className="mt-6 flex justify-center">
                      <Link
                        to="/courses"
                        className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        내 코스 보러가기
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
                                {course.days.length}일 일정
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleUnlikeCourse(e, course.courseId)}
                                title="위시리스트에서 삭제"
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

            {/* 3. 여행기/게시글 탭 */}
            {activeTab === "boards" && (
              <div>
                {boards.length === 0 ? (
                  <div className="mt-6 rounded-2xl bg-muted/50 px-6 py-16 text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-background text-muted-foreground">
                      <BookOpen className="h-7 w-7" />
                    </div>
                    <h2 className="mt-4 text-base font-semibold text-foreground">
                      좋아요한 여행기가 없습니다.
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                      다른 여행자들의 생생한 여행기를 읽고 유용한 정보가 담긴 글을 저장해보세요!
                    </p>
                    <div className="mt-6 flex justify-center">
                      <Link
                        to="/main"
                        className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        메인으로 가기
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
                    {boards.map((board) => (
                      <Link
                        key={board.boardId}
                        to={`/boards/${board.boardId}`}
                        data-testid={`wishlist-board-${board.boardId}`}
                        className="group relative flex min-w-0 flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
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
                          <button
                            type="button"
                            onClick={(e) => handleUnlikeBoard(e, board.boardId)}
                            title="위시리스트에서 삭제"
                            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-primary shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <Heart className="h-[18px] w-[18px] fill-current" />
                          </button>
                        </div>

                        <div className="flex flex-1 flex-col justify-between px-0.5 pb-1 pt-3">
                          <div>
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
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
