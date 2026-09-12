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
    <article className="relative w-[82%] shrink-0 snap-start sm:w-[46%] lg:w-[calc((100%_-_2.5rem)/3)]">
      <Link
        to={`/courses/${course.courseId}`}
        className="group block rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-zinc-100 dark:bg-zinc-800">
          {thumbnail && thumbnail !== failedThumbnail ? (
            <img
              src={getCourseCoverImageSrc(thumbnail)}
              alt={course.title}
              loading="lazy"
              onError={() => setFailedThumbnail(thumbnail)}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
            />
          ) : (
            <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-gradient-to-br from-violet-400 via-primary to-violet-900">
              <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full border border-white/15" />
              <div className="absolute -left-14 top-12 h-48 w-48 rounded-full bg-white/10" />
              <Route className="absolute left-1/2 top-[38%] h-16 w-16 -translate-x-1/2 -translate-y-1/2 text-white/70" strokeWidth={1.2} />
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
          <span className="absolute left-4 top-4 max-w-[calc(100%_-_5.5rem)] truncate rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-zinc-800">
            {course.dayCount}일 일정
          </span>
          <div className="absolute inset-x-5 bottom-5 text-white sm:inset-x-6 sm:bottom-6">
            <h3 className="line-clamp-2 break-keep text-xl font-semibold leading-snug tracking-tight [overflow-wrap:anywhere] sm:text-2xl">
              {course.title}
            </h3>
            <p className="mt-2 flex items-center gap-1 text-xs text-white/85 sm:text-sm">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              방문 {course.spotCount}곳
            </p>
          </div>
        </div>
      </Link>
      {credit && thumbnail !== failedThumbnail && (
        <Link
          to={`/image-credits#${credit.id}`}
          aria-label={`${course.title} 사진 출처`}
          className="absolute bottom-5 right-5 rounded bg-black/25 px-1.5 py-1 text-[10px] text-white/80 transition hover:bg-black/45 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:bottom-6 sm:right-6"
        >사진 출처</Link>
      )}
      <button
        type="button"
        onClick={(event) => onToggleLike(event, course.courseId)}
        disabled={isLoading || isLikeDisabled}
        aria-pressed={isLiked}
        aria-label={isLiked ? `${course.title} 좋아요 취소` : `${course.title} 좋아요`}
        className={`absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 ${
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
