import { useState, type MouseEvent } from "react";
import { ArrowUpRight, Heart, Loader2, MapPin, Route } from "lucide-react";
import { Link } from "react-router-dom";

import type { PublicCourseItem } from "@/services/course";
import { getCourseCoverCredit, getCourseCoverImageSrc } from "@/lib/course-cover-images";
import { CourseCardSummary, CourseThemeLine } from "@/components/ui/course-metadata";

type MainCourseCardProps = {
  course: PublicCourseItem;
  isLiked: boolean;
  isLoading: boolean;
  isLikeDisabled?: boolean;
  onToggleLike: (event: MouseEvent<HTMLButtonElement>, courseId: number) => void;
};

export default function MainCourseCard({
  course,
  isLiked,
  isLoading,
  isLikeDisabled = false,
  onToggleLike,
}: MainCourseCardProps) {
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const thumbnail = course.thumbnail?.trim();
  const credit = getCourseCoverCredit(thumbnail);

  return (
    <article className="group/card relative w-[76%] shrink-0 snap-start rounded-[24px] border border-zinc-200/80 bg-white shadow-[0_4px_16px_-10px_rgb(0_0_0/0.12)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-[0_14px_28px_-14px_rgb(0_0_0/0.18)] motion-reduce:transform-none motion-reduce:transition-none dark:border-zinc-700 dark:bg-background dark:hover:border-zinc-600 sm:w-[46%] lg:w-[calc((100%_-_3.75rem)/4)]">
      <Link
        to={`/courses/${course.courseId}`}
        className="group block rounded-[23px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-t-[23px] bg-primary/5 dark:bg-zinc-800">
          {thumbnail && thumbnail !== failedThumbnail ? (
            <img
              src={getCourseCoverImageSrc(thumbnail)}
              alt={course.title}
              loading="lazy"
              onError={() => setFailedThumbnail(thumbnail)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
            />
          ) : (
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-primary/5">
              <Route className="h-14 w-14 text-primary/35" strokeWidth={1.2} />
            </div>
          )}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/5" />
        </div>
        <div className="p-4 sm:p-5">
          <h3 title={course.title} className="truncate text-[16px] font-bold leading-6 tracking-tight text-foreground">
            {course.title}
          </h3>
          <CourseCardSummary generatedBy={course.generatedBy} dayCount={course.dayCount} className="mt-2.5" />
          <div className="mt-2 h-6 min-w-0">
            <CourseThemeLine themes={course.themes} />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/65" aria-hidden="true" />
              방문 {course.spotCount}곳
            </p>
            <ArrowUpRight className="h-4 w-4 text-primary/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none" aria-hidden="true" />
          </div>
        </div>
      </Link>
      {credit && thumbnail !== failedThumbnail && (
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3]">
          <Link
            to={`/image-credits#${credit.id}`}
            aria-label={`${course.title} 사진 출처`}
            className="pointer-events-auto absolute bottom-3 left-3 rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[10px] font-medium text-white backdrop-blur-md transition-colors hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
          >사진 출처</Link>
        </div>
      )}
      <button
        type="button"
        onClick={(event) => onToggleLike(event, course.courseId)}
        disabled={isLoading || isLikeDisabled}
        aria-pressed={isLiked}
        aria-label={isLiked ? `${course.title} 좋아요 취소` : `${course.title} 좋아요`}
        className={`absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-white/95 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-[color,background-color,transform] hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 motion-reduce:transform-none motion-reduce:transition-none ${
          isLiked ? "text-primary" : "text-zinc-600 hover:text-primary"
        }`}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Heart className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`} strokeWidth={1.8} aria-hidden="true" />
        )}
      </button>
    </article>
  );
}
