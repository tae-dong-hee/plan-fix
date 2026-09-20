import { useState } from "react";
import { ArrowUpRight, Calendar, Eye, Globe, Heart, Lock, MapPin, Mountain, Sun } from "lucide-react";
import { Link } from "react-router-dom";

import courseCoverCatalog from "@/constants/course-cover-images.json";
import { getCourseCoverCredit, getCourseCoverImageSrc } from "@/lib/course-cover-images";
import { getVerifiedSpotImageCredit, getVerifiedSpotImageTitle } from "@/lib/verified-spot-images";
import { cn } from "@/lib/utils";
import type { CourseResponse } from "@/services/course";
import CourseMetadata, { CourseSummaryBadges } from "@/components/ui/course-metadata";

type MyCourseCardProps = {
  course: CourseResponse;
};

function CourseCoverArtwork({ variant }: { variant: number }) {
  const themes = [
    "bg-primary/[0.07] text-primary",
    "bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400",
    "bg-orange-400/[0.09] text-orange-600 dark:text-orange-400",
  ];

  return (
    <div aria-hidden="true" className={`absolute inset-0 overflow-hidden ${themes[variant % themes.length]}`}>
      <svg viewBox="0 0 400 200" fill="none" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <path d="M-40 160 90 60 210 120 310 30 450 100M-30 220 105 120 210 180 340 95 450 140M95 0 105 120 125 240M265-20 210 120 235 240" stroke="currentColor" strokeWidth="1" opacity=".08" />
        <path d="M-20 165C45 165 65 85 140 107S235 180 285 95 360 88 420 36" stroke="currentColor" strokeWidth="30" opacity=".04" />
        <path d="M74 143C123 166 128 83 195 104S267 161 315 81" stroke="currentColor" strokeWidth="2" strokeDasharray="4 7" strokeLinecap="round" opacity=".4" />
        <circle cx="74" cy="143" r="5" fill="currentColor" opacity=".45" />
        <circle cx="315" cy="81" r="5" fill="currentColor" opacity=".45" />
      </svg>
      <Sun className="absolute right-[18%] top-[26%] h-7 w-7 opacity-30" strokeWidth={1.4} />
      <Mountain className="absolute bottom-[19%] left-[17%] h-10 w-10 opacity-30" strokeWidth={1.3} />
      <div className="absolute left-1/2 top-1/2 flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 -rotate-6 items-center justify-center rounded-[22px] border border-background/90 bg-background/90 shadow-[0_12px_30px_-12px_currentColor]">
        <MapPin className="h-9 w-9" strokeWidth={1.5} />
      </div>
    </div>
  );
}

export default function MyCourseCard({ course }: MyCourseCardProps) {
  const [failedThumbnails, setFailedThumbnails] = useState<string[]>([]);
  const spots = course.days.flatMap((day) => day.spots);
  // 코스마다 다른 기본 사진을 고정해 다시 렌더링해도 사진이 바뀌지 않게 한다.
  const fallbackThumbnail = courseCoverCatalog.images[Math.abs(course.courseId) % courseCoverCatalog.images.length]?.url;
  const thumbnail = [course.thumbnail, ...spots.map((spot) => spot.thumbnail), fallbackThumbnail]
    .map((value) => value?.trim())
    .find((value): value is string => !!value && !failedThumbnails.includes(value));
  const spotCredit = getVerifiedSpotImageCredit(thumbnail);
  const credit = getCourseCoverCredit(thumbnail) ?? spotCredit;
  const description = course.description?.trim() || spots.slice(0, 3).map((spot) => spot.title).join(" · ") || "가고 싶은 곳을 담아 나만의 여행을 완성해 보세요.";

  return (
    <article data-testid={`course-item-${course.courseId}`} className="group relative flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-[0_4px_20px_-12px_hsl(var(--foreground)/0.12)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_16px_36px_-20px_hsl(var(--primary)/0.3)] motion-reduce:transform-none motion-reduce:transition-none">
      <Link to={`/courses/${course.courseId}`} aria-label={`${course.title} 코스 상세 보기`} className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
        <div className="relative aspect-[2/1] overflow-hidden bg-muted">
          {thumbnail ? (
            <img src={getCourseCoverImageSrc(thumbnail)} alt="" title={getVerifiedSpotImageTitle(thumbnail)} loading="lazy" onError={() => setFailedThumbnails((previous) => [...previous, thumbnail])} className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none", spotCredit && "object-contain scale-100 hover:scale-100 group-hover:scale-100")} />
          ) : <CourseCoverArtwork variant={course.courseId} />}
        </div>

        <div className="flex flex-1 flex-col px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className={`inline-flex items-center gap-1 ${course.visibility === "PUBLIC" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
              {course.visibility === "PUBLIC" ? <Globe className="h-3 w-3" aria-hidden="true" /> : <Lock className="h-3 w-3" aria-hidden="true" />}
              {course.visibility === "PUBLIC" ? "공개" : "나만 보기"}
            </span>
            <span className="text-muted-foreground">{course.createdAt.substring(0, 10).replace(/-/g, ".")} 저장</span>
          </div>
          <h3 className="mt-3 line-clamp-2 break-words text-lg font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">{course.title}</h3>
          <CourseSummaryBadges generatedBy={course.generatedBy} dayCount={course.days.length} className="mt-2.5" />
          <CourseMetadata themes={course.themes} className="mt-2.5" />
          <p className="mt-2 line-clamp-2 min-h-10 break-words text-[13px] leading-5 text-muted-foreground">{description}</p>

          <div className="mt-auto pt-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-muted/55 px-3 py-2.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
                {course.startDate && course.endDate ? `${course.startDate.substring(5).replace("-", ".")} – ${course.endDate.substring(5).replace("-", ".")}` : "날짜 미정"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/70" aria-hidden="true" />
                {spots.length}개 장소
              </span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1" aria-label={`조회 ${course.viewCount}회`}><Eye className="h-3.5 w-3.5" aria-hidden="true" />{course.viewCount}</span>
              <span className="inline-flex items-center gap-1" aria-label={`좋아요 ${course.likeCount}개`}><Heart className="h-3.5 w-3.5" aria-hidden="true" />{course.likeCount}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">일정 보기<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
          </div>
        </div>
      </Link>

      {credit && <Link to={`/image-credits#${credit.id}`} aria-label={`${course.title} 사진 출처`} className="absolute right-3 top-4 rounded-full bg-black/45 px-2 py-1.5 text-[10px] text-white hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">사진 출처</Link>}

    </article>
  );
}
