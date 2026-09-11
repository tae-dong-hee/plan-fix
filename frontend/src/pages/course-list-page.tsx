import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  ChevronRight,
  Eye,
  Globe,
  Heart,
  Loader2,
  Lock,
  MapPin,
  MapPinPlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import AppNav from "@/components/ui/app-nav";
import { CourseResponse, deleteCourse, fetchMyCourses } from "@/services/course";
import { UnauthorizedError } from "@/services/spots";

export default function CourseListPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteCourse = async (e: React.MouseEvent, courseId: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (!window.confirm("정말 이 코스를 삭제하시겠습니까?")) {
      return;
    }

    try {
      await deleteCourse(courseId);
      setCourses((prev) => prev.filter((c) => c.courseId !== courseId));
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
        navigate("/login");
        return;
      }
      alert(err instanceof Error ? err.message : "코스 삭제에 실패했습니다.");
    }
  };

  const handleEditCourse = (e: React.MouseEvent, courseId: number) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(`/courses/${courseId}/edit`);
  };

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);

    const loadCourses = async () => {
      try {
        const res = await fetchMyCourses();
        if (!ignore) {
          setCourses(res);
        }
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
          navigate("/login");
          return;
        }
        if (!ignore) {
          setError(err instanceof Error ? err.message : "코스 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    loadCourses();

    return () => {
      ignore = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background pb-28 sm:pb-32 md:pb-16 md:pt-16">
      <AppNav />

      <main className="mx-auto max-w-7xl px-5 pt-7 sm:px-8 sm:pt-10 lg:px-10">
        {/* 상단 브레드크럼 */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>여행</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">내 여행 코스</span>
          </div>
          <Link
            to="/courses/create"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            새 코스 만들기
          </Link>
        </div>

        {/* 헤더 */}
        <div className="mt-5 border-b border-border/70 pb-6">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground sm:text-[30px]">
            내 여행 코스
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground sm:text-sm">
            직접 계획하고 저장한 강원도 여행 일정 목록입니다.
          </p>
        </div>

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">코스 목록을 불러오는 중입니다...</p>
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
        ) : courses.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-muted/50 px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-background text-muted-foreground">
              <MapPinPlus className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-foreground">
              생성한 여행 코스가 없습니다.
            </h2>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              강원도의 다양한 인기 명소와 맛집을 골라 나만의 여행 코스를 만들어보세요!
            </p>
            <div className="mt-6 flex justify-center">
              <Link
                to="/courses/create"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                첫 여행 코스 만들기
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => {
              const totalSpots = course.days.reduce(
                (sum, day) => sum + day.spots.length,
                0
              );
              return (
                <Link
                  key={course.courseId}
                  to={`/courses/${course.courseId}`}
                  data-testid={`course-item-${course.courseId}`}
                  className="group flex min-w-0 flex-col justify-between rounded-2xl border border-border/80 bg-background p-5 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                          {course.days.length}일 일정
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            course.visibility === "PUBLIC"
                              ? "bg-muted/70 text-muted-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {course.visibility === "PUBLIC" ? (
                            <>
                              <Globe className="h-2.5 w-2.5" />
                              <span>공개</span>
                            </>
                          ) : (
                            <>
                              <Lock className="h-2.5 w-2.5" />
                              <span>비공개</span>
                            </>
                          )}
                        </span>
                        <span className="basis-full text-[11px] text-muted-foreground">
                          {course.createdAt.substring(0, 10)}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label="코스 수정"
                          title="코스 수정"
                          onClick={(e) => handleEditCourse(e, course.courseId)}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="코스 삭제"
                          title="코스 삭제"
                          onClick={(e) => handleDeleteCourse(e, course.courseId)}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <h2 className="mt-4 line-clamp-2 text-base font-semibold leading-snug tracking-tight text-foreground">
                      {course.title}
                    </h2>

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
                          {course.startDate.substring(5)} ~ {course.endDate.substring(5)}
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
      </main>
    </div>
  );
}
