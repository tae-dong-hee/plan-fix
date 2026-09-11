import type { ReactNode } from "react";
import {
  Fish,
  Flower2,
  Landmark,
  Mountain,
  MountainSnow,
  Music2,
  Sailboat,
  TreeDeciduous,
  Trees,
  Waves,
  type LucideIcon,
} from "lucide-react";

import type { GangwonRegion } from "@/components/ui/gangwon-region-map";

const customSymbols = {
  gangwon: (
    <>
      <path d="m3 13 5-8 5 8m-3 0 4-6 5 6M6 8l2 2 2-2" />
      <path d="M2 17c2.5-2 4.5 2 7 0s4.5 2 7 0 4.5 2 6 0M2 21c2.5-2 4.5 2 7 0s4.5 2 7 0 4.5 2 6 0" />
    </>
  ),
  lake: (
    <>
      <circle cx="16" cy="6" r="2.5" />
      <path d="m3 10 4-5 4 5M3 13h18M5 17h14M8 21h8" />
    </>
  ),
  sunriseCoast: (
    <>
      <path d="M7 13a5 5 0 0 1 10 0M12 2v2M3.5 6.5 5 8m14 0 1.5-1.5M2 13h20" />
      <path d="M2 18c2.5-2 4.5 2 7 0s4.5 2 7 0 4.5 2 6 0" />
    </>
  ),
  snowyMountain: (
    <>
      <path d="m2 21 8-12 8 12H2Zm5-8 3 3 3-3" />
      <path d="M18 2v8m-3.5-6 7 4m-7 0 7-4" />
    </>
  ),
  seorakCoast: (
    <>
      <circle cx="18" cy="5" r="2" />
      <path d="m2 15 5-10 3 5 2-3 5 8M5 9l2 2 2-2" />
      <path d="M2 19c2.5-2 4.5 2 7 0s4.5 2 7 0 4.5 2 6 0" />
    </>
  ),
  cattle: (
    <>
      <path d="M7 5 5 2m12 3 2-3M6 6 2 5v3l4 2m12-4 4-1v3l-4 2" />
      <path d="M6 9c0-3 2-5 6-5s6 2 6 5v7c0 4-3 6-6 6s-6-2-6-6Z" />
      <rect x="8" y="14" width="8" height="5" rx="2.5" />
      <path d="M9 10h.01M15 10h.01M10.5 16.5h.01M13.5 16.5h.01" />
    </>
  ),
  nightMountain: (
    <>
      <path d="m2 21 8-11 8 11H2Zm5-7 3 2 2-1" />
      <path d="m17 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" />
    </>
  ),
  coastalRocks: (
    <>
      <path d="m3 15 2-6 3 6m1 0 2-12 3 4 1 8m3 0 2-4 2 4" />
      <path d="M2 19c2.5-2 4.5 2 7 0s4.5 2 7 0 4.5 2 6 0" />
    </>
  ),
  cave: (
    <>
      <path d="M3 21v-9a9 9 0 0 1 18 0v9M2 21h20" />
      <path d="M8 21v-8l2-3 4 1 2 4v6M8 5l1 3 2-5m5 2-1 3" />
    </>
  ),
} satisfies Record<string, ReactNode>;

// 지역 선택창의 명소·여행 테마에 맞춘 상징을 같은 선 굵기로 표시한다.
const regionSymbols: Record<GangwonRegion, LucideIcon | keyof typeof customSymbols> = {
  철원: Landmark,
  화천: Fish,
  양구: Flower2,
  고성: Sailboat,
  춘천: "lake",
  홍천: Trees,
  인제: TreeDeciduous,
  속초: "seorakCoast",
  양양: Waves,
  원주: Mountain,
  횡성: "cattle",
  평창: "snowyMountain",
  강릉: "sunriseCoast",
  영월: "nightMountain",
  정선: Music2,
  동해: "coastalRocks",
  태백: MountainSnow,
  삼척: "cave",
};

export default function GangwonRegionSymbol({
  region,
  className,
}: {
  region: GangwonRegion | null;
  className?: string;
}) {
  const symbol = region ? regionSymbols[region] : "gangwon";

  if (typeof symbol !== "string") {
    const Icon = symbol;
    return <Icon className={className} strokeWidth={1.7} aria-hidden="true" focusable="false" />;
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {customSymbols[symbol]}
    </svg>
  );
}
