import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Eye, Heart, Loader2, MapPin } from "lucide-react";
import AppNav from "@/components/ui/app-nav";
import CourseMetadata, { CourseSummaryBadges } from "@/components/ui/course-metadata";
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
    <div className="min-h-screen bg-background pb-28 sm:pb-32 md:pb-16 md:pt-16">
      <AppNav />
      <main className="mx-auto max-w-7xl px-5 pt-7 sm:px-8 sm:pt-10 lg:px-10">
        <Link to="/main" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> 메인으로
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-5 border-b border-border/70 pb-6">
          <div>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[30px]">여행 코스</h1>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground sm:text-sm">다른 여행자들이 공유한 강원도 여행 일정입니다.</p>
          </div>
          <div className="flex rounded-full bg-muted/70 p-1" role="tablist" aria-label="코스 정렬">
            <button
              type="button"
              role="tab"
              aria-selected={sort === "latest"}
              onClick={() => setSearchParams({ sort: "latest" })}
              className={`min-h-10 rounded-full px-4 text-[13px] font-medium transition-colors ${sort === "latest" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >전체 코스</button>
            <button
              type="button"
              role="tab"
              aria-selected={sort === "popular"}
              onClick={() => setSearchParams({ sort: "popular" })}
              className={`min-h-10 rounded-full px-4 text-[13px] font-medium transition-colors ${sort === "popular" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >인기순</button>
          </div>
        </div>

        {items === null && !error ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-destructive/20 bg-background px-6 py-12 text-center text-sm text-destructive">코스 목록을 불러오지 못했습니다.</div>
        ) : items?.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-muted/50 px-6 py-16 text-center text-sm text-muted-foreground">공개된 코스가 아직 없습니다.</div>
        ) : (
          <>
            <p className="mt-6 text-[13px] text-muted-foreground">총 {totalCount}개의 코스</p>
            <div className="mt-5 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {items?.map((course) => {
                const credit = getCourseCoverCredit(course.thumbnail);
                return (
                  <article key={course.courseId} className="relative min-w-0">
                    <Link to={`/courses/${course.courseId}`} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                        <img src={getCourseCoverImageSrc(course.thumbnail || FALLBACK_IMAGE)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none" />
                      </div>
                      <div className="px-0.5 pb-1 pt-3">
                        <h2 className="line-clamp-2 break-keep text-[15px] font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">{course.title}</h2>
                        <CourseSummaryBadges generatedBy={course.generatedBy} dayCount={course.dayCount} className="mt-2.5" />
                        <CourseMetadata themes={course.themes} className="mt-2" />
                        {course.description && <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{course.description}</p>}
                        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{course.spotCount}곳</span>
                          <span className="inline-flex items-center gap-1"><Heart className="h-3.5 w-3.5" />{course.likeCount}</span>
                          <span className="inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />{course.viewCount}</span>
                          {course.startDate && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{course.startDate}</span>}
                        </div>
                      </div>
                    </Link>
                    {credit && (
                      <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3]">
                        <Link to={`/image-credits#${credit.id}`} aria-label={`${course.title} 사진 출처`} className="pointer-events-auto absolute left-3 top-3 rounded bg-black/40 px-1.5 py-1 text-[10px] text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">사진 출처</Link>
                      </div>
                    )}
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
