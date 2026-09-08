import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

import AppNav from "@/components/ui/app-nav";
import { sigunguCodeByRegion } from "@/components/ui/gangwon-region-map";
import TravelGuideCard from "@/components/ui/travel-guide-card";
import { guideCards } from "@/data/travel-guides";

export default function TravelGuidesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const region = searchParams.get("region");
  const locationName =
    region && Object.prototype.hasOwnProperty.call(sigunguCodeByRegion, region)
      ? region
      : "강원도";

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [locationName]);

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground md:pb-16 md:pt-16">
      <AppNav />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-8 md:pb-0 md:pt-8 lg:px-10">
          <button
            type="button"
            onClick={() => navigate("/main")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="뒤로 가기"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {locationName}에서 뭐 하지?
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pt-8 sm:px-8 md:pt-6 lg:px-10">
        <p className="text-base text-muted-foreground">
          {locationName} 여행이 처음인 사람들을 위한 안내서
        </p>
        <p className="mb-5 mt-2 text-sm text-muted-foreground">
          총 <span className="font-semibold text-foreground">{guideCards.length}</span>개의 여행 안내
        </p>
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
          aria-label={`${locationName} 여행 안내 전체 목록`}
        >
          {guideCards.map((card) => (
            <li key={card.id} className="min-w-0">
              <TravelGuideCard
                card={card}
                locationName={locationName}
                className="h-48 w-full sm:h-72"
              />
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
