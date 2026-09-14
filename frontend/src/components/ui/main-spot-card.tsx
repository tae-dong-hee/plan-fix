import type { MouseEvent } from "react";
import { Heart, Loader2 } from "lucide-react";
import SpotImage from "@/components/ui/spot-image";
import { Link } from "react-router-dom";

import { sigunguCodeByRegion } from "@/components/ui/gangwon-region-map";
import type { PopularSpot } from "@/services/spots";

const cityByCode = Object.fromEntries(
  Object.entries(sigunguCodeByRegion).map(([city, code]) => [code, city]),
);

type MainSpotCardProps = {
  spot: PopularSpot;
  variant: "guide" | "popular";
  isLiked: boolean;
  isLoading: boolean;
  onToggleLike: (event: MouseEvent<HTMLButtonElement>, spotId: number) => void;
};

export default function MainSpotCard({
  spot,
  variant,
  isLiked,
  isLoading,
  onToggleLike,
}: MainSpotCardProps) {
  const isGuide = variant === "guide";
  const city = spot.region === "51" && spot.sigungu ? cityByCode[spot.sigungu] : undefined;

  return (
    <article
      className={`relative shrink-0 snap-start ${
        isGuide
          ? "w-[76%] sm:w-[46%] lg:w-[calc((100%_-_3.75rem)/4)]"
          : "w-[46%] min-w-[150px] sm:w-56 lg:w-[calc((100%_-_5rem)/5)]"
      }`}
    >
      <Link
        to={`/spots/${spot.spotId}`}
        className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          className={`relative overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800 ${
            isGuide ? "aspect-[4/3]" : "aspect-square"
          }`}
        >
          <SpotImage
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
            src={spot.thumbnail}
            alt={spot.title}
            loading="lazy"
          />
        </div>
        <div className="px-0.5 pb-1 pt-3">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            {spot.title}
          </h3>
          <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {city ? (
              <>
                <span className="shrink-0">{city}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            <span className="truncate">{spot.category}</span>
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={(event) => onToggleLike(event, spot.spotId)}
        disabled={isLoading}
        aria-pressed={isLiked}
        aria-label={isLiked ? `${spot.title} 좋아요 취소` : `${spot.title} 좋아요`}
        className={`absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-sm transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
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
