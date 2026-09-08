import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TravelGuide } from "@/data/travel-guides";

export default function TravelGuideCard({ card, locationName, className }: {
  card: TravelGuide;
  locationName: string;
  className?: string;
}) {
  const title = card.getTitle(locationName);

  return (
    <article className={cn("group relative h-44 overflow-hidden rounded-lg sm:h-72", className)}>
      <img
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        src={card.image}
        alt={card.alt}
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/5" />
      {card.isSample && (
        <span className="absolute left-3 top-3 rounded-full bg-background/95 px-2.5 py-1 text-xs font-semibold text-foreground shadow-sm">
          샘플
        </span>
      )}
      <button
        type="button"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm transition-all hover:bg-black/60 hover:text-white active:scale-90 sm:h-9 sm:w-9"
        aria-label={`${title.replace("\n", " ")} 위시리스트에 추가`}
      >
        <Heart className="h-4.5 w-4.5 sm:h-5 sm:w-5" strokeWidth={2} aria-hidden="true" />
      </button>
      <h3 className="absolute bottom-3 left-3 whitespace-pre-line text-sm font-medium leading-relaxed text-white sm:bottom-5 sm:left-5 sm:text-2xl">
        {title}
      </h3>
    </article>
  );
}
