import { ChevronDown, Loader2 } from "lucide-react";

import type { GangwonRegion } from "@/components/ui/gangwon-region-map";
import GangwonRegionSymbol from "@/components/ui/gangwon-region-symbol";
import type { WeatherDayItem } from "@/services/weather";

const quickRegions: GangwonRegion[] = ["강릉", "속초", "양양", "춘천", "평창", "원주"];

type MainTravelHeaderProps = {
  selectedRegion: GangwonRegion | null;
  isRegionMapOpen: boolean;
  onOpenRegions: () => void;
  onSelectRegion: (region: GangwonRegion | null) => void;
  weatherList: WeatherDayItem[] | null;
  weatherLoading: boolean;
  weatherError: boolean;
};

export default function MainTravelHeader({
  selectedRegion,
  isRegionMapOpen,
  onOpenRegions,
  onSelectRegion,
  weatherList,
  weatherLoading,
  weatherError,
}: MainTravelHeaderProps) {
  const locationName = selectedRegion ?? "강원도";
  const locationLabel = selectedRegion ? `강원도 / ${selectedRegion}` : "강원도 / 지역 선택";

  return (
    <section className="border-b border-border/70">
      <div className="mx-auto max-w-7xl px-5 pb-6 pt-7 sm:px-8 sm:pb-7 sm:pt-10 lg:px-10">
        <div>
            <p className="mb-2 text-xs font-semibold text-primary">PLAN YOUR GANGWON</p>
            <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">어디로 떠나볼까요?</h1>
            <p className="mt-2 break-keep text-[13px] leading-6 text-muted-foreground sm:text-sm">좋아하는 장소를 발견하고, 나만의 여행을 만들어 보세요.</p>
        </div>

        <div className="mt-7 flex flex-col gap-4 sm:mt-8 sm:flex-row sm:items-center sm:gap-5">
          <button
            type="button"
            onClick={onOpenRegions}
            aria-label={`여행 지역 선택: ${locationLabel}`}
            aria-haspopup="dialog"
            aria-expanded={isRegionMapOpen}
            className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2.5 rounded-xl border border-border px-3.5 py-2 text-sm transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <GangwonRegionSymbol region={selectedRegion} className="h-6 w-6 text-primary" />
            <span className="font-semibold">{selectedRegion ? `강원도 · ${selectedRegion}` : "강원도 전체"}</span>
            <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          </button>

          <div role="group" aria-label="지역 바로 선택" className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide sm:gap-2.5 sm:pb-0">
            <button type="button" onClick={() => onSelectRegion(null)} aria-label="강원도 전체 둘러보기" aria-pressed={!selectedRegion} className={`min-h-10 shrink-0 rounded-full px-4 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${!selectedRegion ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>전체</button>
            {quickRegions.map((region) => (
              <button key={region} type="button" onClick={() => onSelectRegion(region)} aria-label={`${region} 바로 선택`} aria-pressed={selectedRegion === region} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${selectedRegion === region ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <GangwonRegionSymbol region={region} className="h-[18px] w-[18px]" />
                {region}
              </button>
            ))}
          </div>
        </div>

        <section aria-labelledby="weather-title" aria-busy={weatherLoading} className="mt-5 rounded-2xl bg-muted/65 px-4 py-3 sm:mt-6 sm:px-5 lg:flex lg:items-center lg:gap-6 lg:py-4">
          <div className="mb-3 flex items-center justify-between gap-3 lg:mb-0 lg:block lg:w-40 lg:shrink-0">
            <h2 id="weather-title" className="text-xs font-semibold sm:text-[13px]">{locationName} 주간 날씨</h2>
            <p className="text-[10px] text-muted-foreground sm:text-[11px] lg:mt-1.5">최저·최고 기온 / 강수확률</p>
          </div>
          {weatherLoading && !weatherList ? (
            <div role="status" className="flex min-h-20 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              <span>{locationName} 날씨 정보를 불러오는 중...</span>
            </div>
          ) : weatherError && !weatherList ? (
            <div className="flex min-h-20 flex-1 items-center justify-center text-sm text-muted-foreground">날씨 정보를 불러오지 못했습니다.</div>
          ) : (
            <div className={`grid min-w-0 flex-1 grid-cols-5 divide-x divide-border/60 transition-opacity ${weatherLoading ? "opacity-40" : ""}`}>
              {(weatherList ?? []).map((weather) => {
                const WeatherIcon = weather.icon;
                return (
                  <article key={weather.date} className="min-w-0 px-1 text-center sm:px-2">
                    <h3 className="whitespace-nowrap text-[10px] font-medium text-muted-foreground sm:text-[11px]">{weather.date} <span className="block min-[375px]:inline">({weather.day})</span></h3>
                    <div className="mt-2 flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2">
                      <WeatherIcon className={`h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${weather.iconClass}`} strokeWidth={1.5} aria-hidden="true" />
                      <p className="whitespace-nowrap text-[10px] font-semibold sm:text-xs">{weather.low}° / {weather.high}°</p>
                    </div>
                    <p className={`mt-1 text-[10px] sm:text-[11px] ${weather.rainProb > 0 ? "text-blue-500" : "text-muted-foreground"}`}>{weather.rainProb}%</p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
