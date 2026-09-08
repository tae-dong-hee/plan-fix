import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  Eye,
  Globe,
  Heart,
  Loader2,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
  UserPlus,
} from "lucide-react";
import AppNav from "@/components/ui/app-nav";
import CourseShareModal from "@/components/ui/course-share-modal";
import { CourseResponse, deleteCourse, fetchCourse } from "@/services/course";
import { UnauthorizedError } from "@/services/spots";

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const saveAction = (location.state as { courseSaveAction?: string } | null)?.courseSaveAction;

  const [course, setCourse] = useState<CourseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const coverSource = course?.thumbnail || course?.days.flatMap((day) => day.spots).find((spot) => spot.thumbnail)?.thumbnail;

  const handleDelete = async () => {
    if (!courseId) return;
    if (!window.confirm("정말 이 여행 코스를 삭제하시겠습니까?")) {
      return;
    }

    setDeleting(true);
    try {
      await deleteCourse(courseId);
      navigate("/courses", { replace: true });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
        navigate("/login");
        return;
      }
      alert(err instanceof Error ? err.message : "코스 삭제에 실패했습니다.");
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!courseId) return;

    let ignore = false;
    setLoading(true);
    setError(null);
    setShareOpen(false);

    const loadCourse = async () => {
      try {
        const res = await fetchCourse(courseId);
        if (!ignore) {
          setCourse(res);
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
          navigate("/login");
          return;
        }
        if (!ignore) {
          setError(err instanceof Error ? err.message : "코스를 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadCourse();

    return () => {
      ignore = true;
    };
  }, [courseId, navigate]);

  return (
    <div className="min-h-screen bg-muted/20 pb-28 sm:pb-32 md:pb-20">
      <AppNav />

      <main className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-10 md:pt-28">
        {/* 상단 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/courses" className="hover:text-foreground">
            내 여행 코스
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">코스 상세</span>
        </div>

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">여행 코스를 불러오는 중입니다...</p>
          </div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
            <p className="text-base font-semibold text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              다시 시도
            </button>
          </div>
        ) : !course ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            <MapPin className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-bold text-foreground">
              존재하지 않거나 삭제된 코스입니다.
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              요청하신 코스 정보를 찾을 수 없습니다.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                to="/courses"
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                코스 목록으로
              </Link>
              <Link
                to="/courses/create"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                새 코스 만들기
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-6">
            {(saveAction === "created" || saveAction === "updated") && (
              <div role="status" className="flex flex-col gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span>
                  <div>
                    <p className="font-bold text-foreground">{saveAction === "created" ? "여행 코스를 저장했어요" : "여행 코스를 수정했어요"}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">여행 일정과 방문 장소를 아래에서 확인해 보세요.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {course.isOwner !== false && <button type="button" onClick={() => setShareOpen(true)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"><UserPlus className="h-4 w-4" aria-hidden="true" />친구에게 공유하기</button>}
                  <Link to="/courses" className="inline-flex shrink-0 items-center justify-center gap-1 rounded-xl border border-primary/25 bg-background px-4 py-2.5 text-xs font-bold text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                    내 코스 전체 보기<ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}
            {/* 코스 헤더 카드 */}
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <div className="relative h-44 overflow-hidden bg-gradient-to-br from-primary/20 via-violet-100/60 to-primary/5 sm:h-56">
                {coverSource && failedCover !== coverSource ? (
                  <img src={coverSource} alt={`${course.title} 대표 사진`} onError={() => setFailedCover(coverSource)} className="h-full w-full object-cover" />
                ) : (
                  <div aria-hidden="true" className="flex h-full items-center justify-center gap-6 text-primary/40">
                    <MapPin className="h-10 w-10 -translate-y-3 sm:h-12 sm:w-12" strokeWidth={1.5} />
                    <span className="w-16 rotate-12 border-t-2 border-dashed border-primary/25 sm:w-28" />
                    <RouteIcon className="h-16 w-16 translate-y-3 sm:h-20 sm:w-20" strokeWidth={1.5} />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-foreground/25 to-transparent" />
                <span className="absolute bottom-4 left-5 inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-1.5 text-xs font-bold text-primary shadow-sm sm:left-8"><RouteIcon className="h-3.5 w-3.5" aria-hidden="true" />나만의 여행 일정</span>
              </div>
              <div className="p-5 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                      {course.days.length}일 코스
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                        course.visibility === "PUBLIC"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {course.visibility === "PUBLIC" ? (
                        <>
                          <Globe className="h-3 w-3" />
                          <span>전체 공개</span>
                        </>
                      ) : (
                        <>
                          <Lock className="h-3 w-3" />
                          <span>비공개</span>
                        </>
                      )}
                    </span>
                  </div>

                  {course.isOwner !== false && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => setShareOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"><UserPlus className="h-4 w-4" aria-hidden="true" />친구 초대</button>
                      <Link
                        to={`/courses/${course.courseId}/edit`}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>코스 수정</span>
                      </Link>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-background px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{deleting ? "삭제 중..." : "코스 삭제"}</span>
                      </button>
                    </div>
                  )}
                </div>

                <h1 className="mt-4 break-words text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl">
                  {course.title}
                </h1>

                {course.description && (
                  <p className="mt-3 break-words text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {course.description}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-y-2 gap-x-6 border-t border-border pt-4 text-xs text-muted-foreground">
                  {course.startDate && course.endDate && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span>
                        {course.startDate} ~ {course.endDate} ({course.days.length}일)
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>
                      총{" "}
                      <strong className="text-foreground">
                        {course.days.reduce((sum, d) => sum + d.spots.length, 0)}
                      </strong>
                      개 장소
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
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
              </div>
            </div>

            {/* Day별 일정 리스트 */}
            <div className="space-y-6">
              {course.days.map((day) => (
                <section
                  key={day.dayNumber}
                  data-testid={`day-detail-${day.dayNumber}`}
                  className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
                >
                  {/* Day 헤더 */}
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3.5 sm:px-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-bold text-xs text-primary-foreground">
                        D{day.dayNumber}
                      </span>
                      <h2 className="text-base font-bold text-foreground">
                        Day {day.dayNumber}
                      </h2>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {day.spots.length}개 장소
                    </span>
                  </div>

                  {/* Day 스팟 목록 */}
                  <div className="p-4 sm:p-6">
                    {day.spots.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                        아직 계획이 없어요.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {day.spots.map((spot, idx) => (
                          <div
                            key={spot.spotId}
                            className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3.5 shadow-sm transition-colors hover:border-primary/40 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                                {idx + 1}
                              </span>
                              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                                {spot.thumbnail ? (
                                  <img
                                    src={spot.thumbnail}
                                    alt={spot.title}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                                    <MapPin className="h-5 w-5" />
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/spots/${spot.spotId}`}
                                  className="truncate text-sm font-bold text-foreground hover:text-primary"
                                >
                                  {spot.title}
                                </Link>
                                <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                  {spot.category}
                                </span>
                              </div>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {spot.address ||
                                  [spot.region, spot.sigungu].filter(Boolean).join(" ") ||
                                  "강원특별자치도"}
                              </p>
                              {spot.memo && (
                                <p className="mt-2 rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                                  💬 {spot.memo}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>

            {/* 하단 액션 버튼 */}
            <div className="flex justify-end gap-3 pt-4">
              <Link
                to="/courses"
                className="rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                코스 목록
              </Link>
              <Link
                to="/courses/create"
                className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow"
              >
                <Plus className="h-4 w-4" />
                새 코스 만들기
              </Link>
            </div>
          </div>
        )}
      </main>
      {shareOpen && course && course.isOwner !== false && !loading && <CourseShareModal course={course} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
