import { sigunguCodeByRegion } from "@/components/ui/gangwon-region-map";
import { MISSING_SPOT_LOCATION } from "@/lib/spot-display";

export type SpotSearchRegion = {
  region: string;
  sigungu?: string;
  label: string;
};

type SpotLocation = {
  region?: string | null;
  sigungu?: string | null;
};

const GANGWON_NAMES = new Set(["51", "강원", "강원도", "강원특별자치도"]);
const gangwonCities = Object.entries(sigunguCodeByRegion);

export const GANGWON_SEARCH_REGIONS: SpotSearchRegion[] = gangwonCities.map(([name, sigungu]) => ({
  region: "51",
  sigungu,
  label: `강원 ${name}`,
}));

function normalizeLocation(spot: SpotLocation): SpotLocation {
  const region = spot.region?.trim() || undefined;
  const sigungu = spot.sigungu?.trim() || undefined;
  const gangwonCity = gangwonCities.find(([name]) =>
    sigungu === name || sigungu === `${name}시` || sigungu === `${name}군`,
  );

  // 시군구 숫자는 다른 시도에서도 겹치므로 시도 정보 없이 강원으로 추정하지 않는다.
  if (GANGWON_NAMES.has(region ?? "") || (!region && gangwonCity)) {
    return { region: "51", sigungu: gangwonCity?.[1] ?? sigungu };
  }
  return { region, sigungu };
}

export function formatSpotRegion(spot: SpotLocation): string {
  const { region, sigungu } = normalizeLocation(spot);
  const regionLabel = region === "51" ? "강원" : region;
  const cityLabel = region === "51"
    ? gangwonCities.find(([, code]) => code === sigungu)?.[0] ?? sigungu
    : sigungu;
  return [regionLabel, cityLabel].filter(Boolean).join(" ") || MISSING_SPOT_LOCATION;
}

function collectCities(spots: SpotLocation[]): SpotSearchRegion[] {
  const unique = new Map<string, SpotSearchRegion>();
  for (const spot of spots) {
    const { region, sigungu } = normalizeLocation(spot);
    // 지역 정보가 없는 장소가 섞여 있어도 기존 시군의 검색 범위를 넓히지 않는다.
    if (!region || !sigungu) continue;
    const key = `${region}:${sigungu}`;
    if (!unique.has(key)) {
      unique.set(key, { region, sigungu, label: formatSpotRegion({ region, sigungu }) });
    }
  }
  return [...unique.values()];
}

/** 선택한 일차의 시군을 우선하고, 비어 있으면 코스의 다른 일차에서 찾는다. */
export function inferCourseSearchRegions(days: SpotLocation[][], activeDayIndex: number): SpotSearchRegion[] {
  const dayRegions = collectCities(days[activeDayIndex] ?? []);
  return dayRegions.length > 0 ? dayRegions : collectCities(days.flat());
}
