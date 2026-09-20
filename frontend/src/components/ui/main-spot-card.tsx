import type { MouseEvent } from "react";
import { ArrowUpRight, Heart, Loader2, MapPin } from "lucide-react";
import SpotImage from "@/components/ui/spot-image";
import { GooglePhotoAttribution } from "@/components/ui/spot-photo-gallery";
import { Link } from "react-router-dom";

import { sigunguCodeByRegion } from "@/components/ui/gangwon-region-map";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";
import type { PopularSpot } from "@/services/spots";
import { useGoogleSpotCover } from "@/hooks/use-google-spot-cover";

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
  const { viewportRef, photo, attribution, onSourceChange } = useGoogleSpotCover(spot);
  const isGuide = variant === "guide";
  const city = spot.region === "51" && spot.sigungu ? cityByCode[spot.sigungu] : undefined;

  return (
    <article
      ref={viewportRef}
      className={`relative shrink-0 snap-start rounded-[24px] border border-zinc-200/80 bg-white shadow-[0_4px_16px_-10px_rgb(0_0_0/0.12)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-zinc-300 hover:shadow-[0_14px_28px_-14px_rgb(0_0_0/0.18)] motion-reduce:transform-none motion-reduce:transition-none dark:border-zinc-700 dark:bg-background dark:hover:border-zinc-600 ${
        isGuide
          ? "w-[76%] sm:w-[46%] lg:w-[calc((100%_-_3.75rem)/4)]"
          : "w-[46%] min-w-[150px] sm:w-56 lg:w-[calc((100%_-_5rem)/5)]"
      }`}
    >
      <Link
        to={`/spots/${spot.spotId}`}
        className="group block rounded-[23px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      >
        <div
          className={`relative overflow-hidden rounded-t-[23px] bg-primary/5 dark:bg-zinc-800 ${
            isGuide ? "aspect-[4/3]" : "aspect-square"
          }`}
        >
          <SpotImage
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
            src={photo?.url ?? spot.thumbnail}
            onSourceChange={onSourceChange}
            similarImage={getSimilarSpotImage(spot)}
            alt={spot.title}
            loading="lazy"
          />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 break-keep text-[15px] font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary motion-reduce:transition-none [overflow-wrap:anywhere]">
              {spot.title}
            </h3>
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-primary/65 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none" aria-hidden="true" />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
            {city ? (
              <>
                <MapPin className="h-3 w-3 shrink-0 text-primary/65" aria-hidden="true" />
                <span className="shrink-0">{city}</span>
                <span className="text-primary/25" aria-hidden="true">·</span>
              </>
            ) : null}
            <span className="truncate">{spot.category}</span>
          </p>
        </div>
      </Link>
      {attribution ? (
        <div className={`pointer-events-none absolute inset-x-0 top-0 ${isGuide ? "aspect-[4/3]" : "aspect-square"}`}>
          <GooglePhotoAttribution google={attribution} compact className="pointer-events-auto absolute bottom-2 left-2 right-2 rounded-md bg-white/95 px-2 py-1 text-zinc-700 shadow-sm dark:bg-zinc-900/95 dark:text-zinc-100" />
        </div>
      ) : null}
      <button
        type="button"
        onClick={(event) => onToggleLike(event, spot.spotId)}
        disabled={isLoading}
        aria-pressed={isLiked}
        aria-label={isLiked ? `${spot.title} 좋아요 취소` : `${spot.title} 좋아요`}
        className={`absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/80 bg-white/95 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-md transition-[color,background-color,transform] hover:scale-105 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70 motion-reduce:transform-none motion-reduce:transition-none ${
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
