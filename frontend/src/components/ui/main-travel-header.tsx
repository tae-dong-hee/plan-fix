import { ArrowUpRight, ChevronDown, CloudSun, Compass, Loader2, Map, Sparkles, Sun } from "lucide-react";
import { Link } from "react-router-dom";

import type { GangwonRegion } from "@/components/ui/gangwon-region-map";
import GangwonRegionSymbol from "@/components/ui/gangwon-region-symbol";
import type { WeatherDayItem } from "@/services/weather";
import "./main-travel-header.css";

const quickRegions: GangwonRegion[] = ["강릉", "속초", "양양", "춘천", "평창", "원주"];

function TravelPostcard() {
  return (
    <div className="travel-hero-art" aria-hidden="true">
      <div className="travel-hero-orbit" />
      <svg className="travel-hero-route" viewBox="0 0 430 260" fill="none">
        <path d="M28 210C-1 115 164 178 205 95C239 26 315 11 393 42" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 7" strokeLinecap="round" />
        <circle cx="28" cy="210" r="5" fill="currentColor" />
        <circle cx="393" cy="42" r="5" fill="currentColor" />
      </svg>
      <div className="travel-hero-postcard">
        <svg viewBox="0 0 270 168" className="travel-hero-landscape" fill="none">
          <rect width="270" height="168" fill="#DCEAE6" />
          <circle cx="208" cy="39" r="20" fill="#FFF3CA" />
          <path d="M0 98 56 24 107 96 147 54 200 111 270 101V168H0Z" fill="#859A88" />
          <path d="m31 59 25-35 25 35-16-7-9 10-11-9Z" fill="#F5F4E9" />
          <path d="m113 92 34-38 37 40-25-10-12 6-13-8Z" fill="#B9C9AC" />
          <path d="M0 118c51-21 91-6 135-5s89-13 135-7v62H0Z" fill="#95C9CA" />
          <path d="M0 140c64-17 130 14 192 2 27-5 54-4 78 0v26H0Z" fill="#73B5C0" />
          <path d="M0 149c53-10 84 5 119 7 55 2 96-6 151-3v15H0Z" fill="#E9DCCA" />
          <path d="M112 128h37m15-7h42m-170 3h34m115 28h24" stroke="#EAF8EF" strokeWidth="2" strokeLinecap="round" />
          <path d="M219 139v-28m0 0-15 22h15Z" fill="#FFF9EB" />
          <path d="M209 141h25l-5 5h-16Z" fill="#695080" />
          <path d="m21 143 8-25 8 25Zm12 5 10-31 10 31Z" fill="#416953" />
          <path d="M29 148v-12m14 17v-15" stroke="#416953" strokeWidth="2" />
        </svg>
        <div className="travel-hero-postcard-caption">
          <span>GANGWON</span>
          <Compass size={19} strokeWidth={1.4} />
        </div>
        <span className="travel-hero-postcard-note">산과 바다 사이, 우리만의 여행</span>
      </div>
      <div className="travel-hero-stamp"><Sparkles size={17} strokeWidth={1.6} /><span>PLAN.<br />FIX. GO.</span></div>
      <div className="travel-hero-art-tag"><span />마음이 이끄는 곳으로</div>
    </div>
  );
}

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
  const locationLabel = selectedRegion ? `강원도 ${selectedRegion}` : "강원도 전체";

  return (
    <section className="main-travel-header">
      <div className="app-page-content mx-auto max-w-7xl px-5 pb-5 sm:px-8 lg:px-10">
        <div className="travel-hero">
          <div className="travel-hero-copy">
            <p className="travel-hero-eyebrow"><span />PLAN YOUR GANGWON</p>
            <p className="travel-hero-pretitle">계획은 가볍게, 여행은 나답게.</p>
            <h1 className="travel-hero-title">어디로 떠나볼까요?</h1>
            <p className="travel-hero-description">좋아하는 장소를 발견하고, 나만의 여행을 만들어 보세요.</p>
            <div className="travel-hero-actions">
              <Link to="/courses/create?mode=ai" className="travel-hero-primary"><Sparkles size={22} strokeWidth={2.5} aria-hidden="true" />AI로 여행 만들기<ArrowUpRight size={18} strokeWidth={2.5} aria-hidden="true" /></Link>
              <div className="travel-hero-shortcuts">
                <Link to="/courses/create?mode=ai&trip=daytrip" className="travel-hero-secondary travel-hero-daytrip"><Sun size={22} strokeWidth={2.5} aria-hidden="true" />당일치기 떠나기<ArrowUpRight size={18} strokeWidth={2.5} aria-hidden="true" /></Link>
                <Link to="/courses/create" className="travel-hero-secondary"><Map size={22} strokeWidth={2.5} aria-hidden="true" />직접 코스 짜기<ArrowUpRight size={18} strokeWidth={2.5} aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
          <TravelPostcard />
        </div>

        <div className="travel-region-bar">
          <button
            type="button"
            onClick={onOpenRegions}
            aria-label={`지도에서 지역 선택: ${locationLabel}`}
            aria-haspopup="dialog"
            aria-expanded={isRegionMapOpen}
            className="travel-region-select inline-flex min-h-11 w-full shrink-0 md:w-fit items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Map className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="flex flex-col gap-0.5 text-left">
              <span className="font-semibold text-primary">지도에서 지역 선택</span>
              <span className="text-[11px] text-muted-foreground">{selectedRegion ? `선택한 지역 · ${selectedRegion}` : "강원도 18개 시·군"}</span>
            </span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-primary" aria-hidden="true" />
          </button>

          <div role="group" aria-label="지역 바로 선택" className="travel-region-shortcuts flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">빠른 선택</span>
            <div className="travel-region-tabs -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-1 scrollbar-hide sm:gap-2">
              <button type="button" onClick={() => onSelectRegion(null)} aria-label="강원도 전체 둘러보기" aria-pressed={!selectedRegion} className={`min-h-10 shrink-0 rounded-full px-4 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${!selectedRegion ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>강원도</button>
              {quickRegions.map((region) => (
                <button key={region} type="button" onClick={() => onSelectRegion(region)} aria-label={`${region} 바로 선택`} aria-pressed={selectedRegion === region} className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${selectedRegion === region ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <GangwonRegionSymbol region={region} className="h-[18px] w-[18px]" />
                  {region}
                </button>
              ))}
            </div>
          </div>
        </div>

        <section aria-labelledby="weather-title" aria-busy={weatherLoading} className="travel-weather-strip rounded-2xl px-4 py-3 sm:px-5 lg:flex lg:items-center lg:gap-6 lg:py-4">
          <div className="mb-3 flex items-center justify-between gap-3 lg:mb-0 lg:w-48 lg:shrink-0 lg:justify-start">
            <span className="travel-weather-icon"><CloudSun size={22} strokeWidth={1.4} aria-hidden="true" /></span>
            <div className="flex flex-1 flex-wrap items-center justify-between gap-x-2 gap-y-1 lg:block">
              <h2 id="weather-title" className="text-xs font-semibold sm:text-[13px]">{locationName} 주간 날씨</h2>
              <p className="text-[10px] text-muted-foreground sm:text-[11px] lg:mt-1.5">최저·최고 기온 / 강수확률</p>
            </div>
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
