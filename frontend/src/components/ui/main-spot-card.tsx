import type { MouseEvent } from "react";
import { Heart, Loader2, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

import { sigunguCodeByRegion } from "@/components/ui/gangwon-region-map";
import type { PopularSpot } from "@/services/spots";

const FALLBACK_SPOT_IMAGE =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=85";
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
          ? "w-[82%] sm:w-[46%] lg:w-[calc((100%_-_2.5rem)/3)]"
          : "w-[46%] min-w-[150px] sm:w-56 lg:w-[calc((100%_-_3.75rem)/4)]"
      }`}
    >
      <Link
        to={`/spots/${spot.spotId}`}
        className={`group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
          isGuide ? "rounded-3xl" : "rounded-[20px]"
        }`}
      >
        <div
          className={`relative overflow-hidden bg-zinc-100 dark:bg-zinc-800 ${
            isGuide ? "aspect-[4/3] rounded-3xl" : "aspect-[5/4] rounded-[20px]"
          }`}
        >
          <img
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
            src={spot.thumbnail || FALLBACK_SPOT_IMAGE}
            alt={spot.title}
            loading="lazy"
            onError={(event) => {
              if (event.currentTarget.src !== FALLBACK_SPOT_IMAGE) {
                event.currentTarget.src = FALLBACK_SPOT_IMAGE;
              }
            }}
          />
          {isGuide ? (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <span className="absolute left-4 top-4 max-w-[calc(100%_-_5.5rem)] truncate rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-zinc-800">
                {spot.category}
              </span>
              <div className="absolute inset-x-5 bottom-5 text-white sm:inset-x-6 sm:bottom-6">
                {city ? (
                  <p className="mb-2 flex items-center gap-1 text-xs text-white/85 sm:text-sm">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {city}
                  </p>
                ) : null}
                <h3 className="line-clamp-2 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
                  {spot.title}
                </h3>
              </div>
            </>
          ) : null}
        </div>
        {!isGuide ? (
          <div className="px-0.5 pb-1 pt-3.5">
            <p className="mb-1.5 flex items-center gap-2 text-xs sm:text-sm">
              <span className="truncate font-medium text-primary">{spot.category}</span>
              {city ? (
                <>
                  <span className="text-muted-foreground/50" aria-hidden="true">·</span>
                  <span className="shrink-0 text-muted-foreground">{city}</span>
                </>
              ) : null}
            </p>
            <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary sm:text-lg">
              {spot.title}
            </h3>
          </div>
        ) : null}
      </Link>
      <button
        type="button"
        onClick={(event) => onToggleLike(event, spot.spotId)}
        disabled={isLoading}
        aria-pressed={isLiked}
        aria-label={isLiked ? `${spot.title} 좋아요 취소` : `${spot.title} 좋아요`}
        className={`absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 ${
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
