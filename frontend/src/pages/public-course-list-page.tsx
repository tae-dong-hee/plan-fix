import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Eye, Heart, Loader2, MapPin } from "lucide-react";
import AppNav from "@/components/ui/app-nav";
import { fetchPublicCourses, type PublicCourseItem } from "@/services/course";
import { getCourseCoverCredit, getCourseCoverImageSrc } from "@/lib/course-cover-images";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=85";

export default function PublicCourseListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = searchParams.get("sort") === "popular" ? "popular" : "latest";
  const [items, setItems] = useState<PublicCourseItem[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let ignore = false;
    setItems(null);
    setError(false);
    fetchPublicCourses({ sort, size: 20 })
      .then((result) => {
        if (!ignore) {
          setItems(result.items);
          setTotalCount(result.totalCount);
        }
      })
      .catch(() => {
        if (!ignore) setError(true);
      });
    return () => {
      ignore = true;
    };
  }, [sort]);

  return (
    <div className="min-h-screen bg-muted/20 pb-20 md:pt-20">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8">
        <Link to="/main" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 메인으로
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">여행 코스</h1>
            <p className="mt-1 text-sm text-muted-foreground">다른 여행자들이 공유한 강원도 여행 일정입니다.</p>
          </div>
          <div className="flex rounded-xl bg-muted p-1" role="tablist" aria-label="코스 정렬">
            <button
              type="button"
              role="tab"
              aria-selected={sort === "latest"}
              onClick={() => setSearchParams({ sort: "latest" })}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${sort === "latest" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >전체 코스</button>
            <button
              type="button"
              role="tab"
              aria-selected={sort === "popular"}
              onClick={() => setSearchParams({ sort: "popular" })}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${sort === "popular" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >인기순</button>
          </div>
        </div>

        {items === null && !error ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-destructive/30 bg-card p-8 text-center text-destructive">코스 목록을 불러오지 못했습니다.</div>
        ) : items?.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">공개된 코스가 아직 없습니다.</div>
        ) : (
          <>
            <p className="mt-6 text-sm text-muted-foreground">총 {totalCount}개의 코스</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items?.map((course) => {
                const credit = getCourseCoverCredit(course.thumbnail);
                return (
                  <article key={course.courseId} className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-sm transition hover:border-primary/50 hover:shadow-md">
                    <Link to={`/courses/${course.courseId}`} className="block">
                      <div className="relative h-44 bg-muted">
                        <img src={getCourseCoverImageSrc(course.thumbnail || FALLBACK_IMAGE)} alt="" loading="lazy" className="h-full w-full object-cover" />
                        <span className="absolute bottom-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold">{course.dayCount}일 일정</span>
                      </div>
                      <div className="p-4">
                        <h2 className="truncate text-base font-bold">{course.title}</h2>
                        {course.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{course.description}</p>}
                        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{course.spotCount}곳</span>
                          <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{course.likeCount}</span>
                          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{course.viewCount}</span>
                          {course.startDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{course.startDate}</span>}
                        </div>
                      </div>
                    </Link>
                    {credit && <Link to={`/image-credits#${credit.id}`} aria-label={`${course.title} 사진 출처`} className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1.5 text-[10px] text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">사진 출처</Link>}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
