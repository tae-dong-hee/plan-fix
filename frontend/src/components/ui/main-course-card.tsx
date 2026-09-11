import { useState, type MouseEvent } from "react";
import { Heart, Loader2, MapPin, Route } from "lucide-react";
import { Link } from "react-router-dom";

import type { PublicCourseItem } from "@/services/course";
import { getCourseCoverCredit, getCourseCoverImageSrc } from "@/lib/course-cover-images";

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
    <article className="relative w-[76%] shrink-0 snap-start sm:w-[46%] lg:w-[calc((100%_-_3.75rem)/4)]">
      <Link
        to={`/courses/${course.courseId}`}
        className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800">
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
          <span className="absolute left-3 top-3 max-w-[calc(100%_-_5rem)] truncate rounded-full bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-800 shadow-sm">
            {course.dayCount}일 일정
          </span>
        </div>
        <div className="px-0.5 pb-1 pt-3">
          <h3 className="line-clamp-2 break-keep text-[15px] font-semibold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere]">
            {course.title}
          </h3>
          <p className="mt-1.5 flex items-center gap-1 text-[13px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            방문 {course.spotCount}곳
          </p>
        </div>
      </Link>
      {credit && thumbnail !== failedThumbnail && (
        <div className="pointer-events-none absolute inset-x-0 top-0 aspect-[4/3]">
          <Link
            to={`/image-credits#${credit.id}`}
            aria-label={`${course.title} 사진 출처`}
            className="pointer-events-auto absolute bottom-2.5 right-3 rounded bg-black/40 px-1.5 py-1 text-[10px] text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >사진 출처</Link>
        </div>
      )}
      <button
        type="button"
        onClick={(event) => onToggleLike(event, course.courseId)}
        disabled={isLoading || isLikeDisabled}
        aria-pressed={isLiked}
        aria-label={isLiked ? `${course.title} 좋아요 취소` : `${course.title} 좋아요`}
        className={`absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${
          isLiked ? "text-primary" : "text-zinc-700 hover:text-primary"
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
