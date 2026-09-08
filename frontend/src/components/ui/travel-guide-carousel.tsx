import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import TravelGuideCard from "@/components/ui/travel-guide-card";
import { guideCards } from "@/data/travel-guides";


export default function TravelGuideCarousel({ locationName }: { locationName: string }) {
  const allGuidesUrl = locationName === "강원도"
    ? "/travel-guides"
    : `/travel-guides?${new URLSearchParams({ region: locationName })}`;
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateButtons = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    setCanScrollLeft(carousel.scrollLeft > 1);
    setCanScrollRight(carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateButtons();
    window.addEventListener("resize", updateButtons);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateButtons);
    if (carouselRef.current) observer?.observe(carouselRef.current);
    return () => {
      window.removeEventListener("resize", updateButtons);
      observer?.disconnect();
    };
  }, [updateButtons]);

  const scroll = (direction: -1 | 1) => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const cardWidth = carousel.firstElementChild?.getBoundingClientRect().width ?? 0;
    const gap = parseFloat(window.getComputedStyle(carousel).columnGap) || 0;
    const distance = cardWidth > 0 ? cardWidth + gap : carousel.clientWidth * 0.8;
    if (typeof carousel.scrollBy === "function") {
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      carousel.scrollBy({ left: direction * distance, behavior: reduceMotion ? "auto" : "smooth" });
    } else {
      carousel.scrollLeft += direction * distance;
      updateButtons();
    }
  };

  return (
    <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-12" aria-labelledby="travel-guide-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="travel-guide-title" className="min-w-0 text-3xl font-semibold tracking-tight sm:text-4xl">{locationName}에서 뭐 하지?</h2>
        <Link
          to={allGuidesUrl}
          aria-label={`${locationName}에서 뭐 하지? 전체보기`}
          title="전체보기"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <ArrowRight className="h-6 w-6" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-2 text-base text-muted-foreground sm:text-lg">
        {locationName} 여행이 처음인 사람들을 위한 안내서
      </p>

      <div className="relative mt-6">
        <button
          type="button"
          onClick={() => scroll(-1)}
          disabled={!canScrollLeft}
          aria-label="이전 여행 안내 그림 보기"
          aria-controls="travel-guide-cards"
          className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background disabled:cursor-default disabled:opacity-40 sm:left-3 sm:h-12 sm:w-12"
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
        </button>

        <div
          id="travel-guide-cards"
          ref={carouselRef}
          onScroll={updateButtons}
          role="region"
          aria-label={`${locationName} 여행 안내 카드`}
          aria-roledescription="캐러셀"
          tabIndex={0}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scrollbar-hide sm:gap-4"
        >
          {guideCards.map((card) => (
            <TravelGuideCard
              key={card.id}
              card={card}
              locationName={locationName}
              className="w-[82%] shrink-0 snap-start sm:w-[46%] lg:w-[38%]"
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => scroll(1)}
          disabled={!canScrollRight}
          aria-label="다음 여행 안내 그림 보기"
          aria-controls="travel-guide-cards"
          className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-background disabled:cursor-default disabled:opacity-40 sm:right-3 sm:h-12 sm:w-12"
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
