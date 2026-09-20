import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Loader2,
  MapPinPlus,
  Plus,
  Route,
} from "lucide-react";
import AppNav from "@/components/ui/app-nav";
import InviteTripArtwork from "@/components/ui/invite-trip-artwork";
import MyCourseCard from "@/components/ui/my-course-card";
import { CourseResponse, fetchMyCourses } from "@/services/course";
import { UnauthorizedError } from "@/services/spots";

export default function CourseListPage() {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <div className="app-page min-h-screen bg-muted/20 pb-28 sm:pb-32 md:pb-16">
      <AppNav />

      <main className="app-page-content mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <nav aria-label="현재 위치" className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/main" className="transition-colors hover:text-primary">여행</Link>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span aria-current="page" className="font-medium text-foreground">내 여행 코스</span>
        </nav>

        <section aria-labelledby="my-courses-title" className="relative isolate overflow-hidden rounded-[28px] border border-primary/10 bg-primary/[0.05] p-6 sm:p-8 lg:px-10 lg:py-9">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-32 -z-10 h-80 w-80 rounded-full border-[48px] border-primary/[0.035]" />
          <div className="flex items-center justify-between gap-8">
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.2em] text-primary sm:text-[11px]">MY TRAVEL COLLECTION</p>
              <h1 id="my-courses-title" className="mt-3 text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[34px]">내 여행 코스</h1>
              <p className="mt-3 break-keep text-[13px] leading-6 text-muted-foreground sm:text-sm">가고 싶은 곳을 모아, 나만의 강원도 여행으로.<br className="sm:hidden" /> 설레는 다음 여행을 계획해 보세요.</p>
              <Link to="/courses/create" className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-[13px] font-semibold text-primary-foreground shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.5)] transition-[background-color,box-shadow] hover:bg-primary/90 hover:shadow-[0_8px_22px_-6px_hsl(var(--primary)/0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
                <Plus className="h-4 w-4" aria-hidden="true" />
                새 코스 만들기
              </Link>
            </div>
            <div className="hidden w-64 shrink-0 lg:block"><InviteTripArtwork /></div>
          </div>
        </section>

        <section aria-labelledby="saved-courses-title" className="mt-9 sm:mt-10">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Route className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />
              <h2 id="saved-courses-title" className="text-base font-bold tracking-tight text-foreground sm:text-lg">저장한 코스</h2>
              {!loading && !error && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-bold text-primary">{courses.length}</span>}
            </div>
            <p className="hidden text-xs text-muted-foreground sm:block">함께 떠나고 싶은 순간들을 모았어요</p>
          </div>

          {loading ? (
            <div role="status" className="flex h-64 flex-col items-center justify-center gap-3 rounded-3xl border border-border/60 bg-background">
              <Loader2 className="h-8 w-8 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">코스 목록을 불러오는 중입니다...</p>
            </div>
          ) : error ? (
            <div role="alert" className="rounded-3xl border border-destructive/20 bg-background px-6 py-12 text-center">
              <p className="text-base font-semibold text-destructive">{error}</p>
              <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-11 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">다시 시도</button>
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-primary/20 bg-background px-6 py-16 text-center">
              <div className="mx-auto flex h-16 w-16 -rotate-6 items-center justify-center rounded-[22px] bg-primary/10 text-primary"><MapPinPlus className="h-8 w-8" strokeWidth={1.5} aria-hidden="true" /></div>
              <h3 className="mt-6 text-lg font-bold text-foreground">생성한 여행 코스가 없습니다.</h3>
              <p className="mt-2 break-keep text-[13px] leading-6 text-muted-foreground">강원도의 다양한 인기 명소와 맛집을 골라<br className="sm:hidden" /> 나만의 여행 코스를 만들어보세요!</p>
              <Link to="/courses/create" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
                <Plus className="h-4 w-4" aria-hidden="true" />첫 여행 코스 만들기
              </Link>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => <MyCourseCard key={course.courseId} course={course} />)}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
