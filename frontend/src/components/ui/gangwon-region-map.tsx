import {
  useEffect,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Check, Compass, Landmark, MapPinned, UtensilsCrossed, X } from "lucide-react";

import { gangwonMapPaths } from "@/assets/gangwon-map-paths";

import "./gangwon-region-map.css";

export type GangwonRegion =
  | "철원"
  | "화천"
  | "양구"
  | "고성"
  | "춘천"
  | "홍천"
  | "인제"
  | "속초"
  | "양양"
  | "원주"
  | "횡성"
  | "평창"
  | "강릉"
  | "영월"
  | "정선"
  | "동해"
  | "태백"
  | "삼척";

type RegionMapItem = {
  name: GangwonRegion;
  mapId: string;
  label: [number, number];
  labelLetterSpacing?: number;
  mapScale?: number;
};

type RegionGuide = {
  description: string;
  keywords: [string, string];
  attractions: [string, string];
  foods: [string, string];
};

// 지자체 문화관광 포털과 한국관광공사 자료를 기준으로 정리한 지역별 여행 정보입니다.
const regionGuides = {
  철원: {
    description: "용암이 빚은 한탄강 절경과 DMZ의 역사를 함께 만나는 곳이에요.",
    keywords: ["DMZ 역사", "지질 트레킹"],
    attractions: ["고석정", "한탄강 주상절리길"],
    foods: ["철원 오대쌀", "철원 막국수"],
  },
  화천: {
    description: "북한강과 파로호를 따라 평화와 청정 자연을 즐길 수 있어요.",
    keywords: ["호수 힐링", "평화 여행"],
    attractions: ["파로호", "평화의댐"],
    foods: ["산천어 요리", "화천 토마토"],
  },
  양구: {
    description: "국토 정중앙에서 DMZ 생태와 예술을 함께 만나는 고장이에요.",
    keywords: ["DMZ 생태", "예술 산책"],
    attractions: ["두타연", "박수근미술관"],
    foods: ["양구 곰취", "펀치볼 시래기"],
  },
  고성: {
    description: "금강산 전망과 호수, 동해가 이어지는 최북단 해안 여행지예요.",
    keywords: ["안보 관광", "해안 드라이브"],
    attractions: ["통일전망대", "화진포"],
    foods: ["명태 요리", "도루묵 요리"],
  },
  춘천: {
    description: "호수 풍경과 낭만적인 산책길이 어우러진 대표적인 호반 도시예요.",
    keywords: ["호반 산책", "감성 데이트"],
    attractions: ["남이섬", "소양강스카이워크"],
    foods: ["춘천 닭갈비", "막국수"],
  },
  홍천: {
    description: "울창한 숲과 계곡에서 자연 체험과 휴식을 즐기기 좋은 곳이에요.",
    keywords: ["숲속 휴식", "동물 체험"],
    attractions: ["공작산 수타사", "알파카월드"],
    foods: ["홍천 화로구이", "찰옥수수"],
  },
  인제: {
    description: "설악산 자락의 깊은 숲과 맑은 계곡이 살아 있는 생태 여행지예요.",
    keywords: ["숲 트레킹", "계곡 레저"],
    attractions: ["원대리 자작나무숲", "백담사"],
    foods: ["용대리 황태", "빙어 요리"],
  },
  속초: {
    description: "설악산과 동해, 실향민 문화가 한데 어우러진 항구 도시예요.",
    keywords: ["산·바다", "시장 투어"],
    attractions: ["설악산", "속초관광수산시장"],
    foods: ["아바이순대", "오징어순대"],
  },
  양양: {
    description: "천년 고찰과 푸른 바다, 서핑 문화가 공존하는 해안 여행지예요.",
    keywords: ["서핑", "일출 여행"],
    attractions: ["낙산사", "하조대"],
    foods: ["양양 송이", "섭국"],
  },
  원주: {
    description: "산악 체험과 현대 예술, 오래된 도심 문화가 조화를 이루는 곳이에요.",
    keywords: ["예술 여행", "산악 체험"],
    attractions: ["소금산 그랜드밸리", "뮤지엄산"],
    foods: ["원주 추어탕", "관찰사 옹심이"],
  },
  횡성: {
    description: "고요한 호수길과 근대 문화유산을 천천히 둘러보기 좋은 고장이에요.",
    keywords: ["호수 산책", "미식 여행"],
    attractions: ["횡성호수길", "풍수원성당"],
    foods: ["횡성한우", "안흥찐빵"],
  },
  평창: {
    description: "대관령 고원과 오대산의 사계절 풍경이 펼쳐지는 산악 여행지예요.",
    keywords: ["고원 풍경", "사찰 산책"],
    attractions: ["대관령양떼목장", "월정사"],
    foods: ["메밀 음식", "황태구이"],
  },
  강릉: {
    description: "동해 일출과 커피 문화, 전통의 맛을 함께 즐길 수 있는 도시예요.",
    keywords: ["바다 산책", "커피 여행"],
    attractions: ["경포해변", "안목 커피거리"],
    foods: ["초당순두부", "장칼국수"],
  },
  영월: {
    description: "동강의 절경과 단종의 역사, 밤하늘의 별을 만날 수 있는 곳이에요.",
    keywords: ["역사 여행", "별 관측"],
    attractions: ["청령포", "별마로천문대"],
    foods: ["다슬기 요리", "곤드레나물밥"],
  },
  정선: {
    description: "아리랑의 흥과 고원 풍경, 옛 장터의 정취가 살아 있는 고장이에요.",
    keywords: ["아리랑 문화", "전통시장"],
    attractions: ["정선아리랑시장", "화암동굴"],
    foods: ["곤드레밥", "콧등치기국수"],
  },
  동해: {
    description: "기암 해안과 깊은 계곡을 한 여행에서 만날 수 있는 바다 도시예요.",
    keywords: ["해안 절경", "계곡 트레킹"],
    attractions: ["추암 촛대바위", "무릉계곡"],
    foods: ["곰치국", "물회"],
  },
  태백: {
    description: "백두대간의 시원한 고원과 탄광 문화가 특별한 산악 도시예요.",
    keywords: ["고원 트레킹", "탄광 문화"],
    attractions: ["태백산", "용연동굴"],
    foods: ["태백 물닭갈비", "한우실비"],
  },
  삼척: {
    description: "신비로운 동굴과 투명한 바다가 이어지는 해양·지질 여행지예요.",
    keywords: ["동굴 탐험", "해양 체험"],
    attractions: ["환선굴", "장호항"],
    foods: ["곰치국", "활어회"],
  },
} satisfies Record<GangwonRegion, RegionGuide>;

const regionMapItems: RegionMapItem[] = [
  { name: "철원", mapId: "철원군", label: [120, 174] },
  { name: "화천", mapId: "화천군", label: [208, 210] },
  { name: "양구", mapId: "양구군", label: [315, 195] },
  { name: "고성", mapId: "고성군", label: [446, 94] },
  { name: "춘천", mapId: "춘천시", label: [218, 330] },
  { name: "홍천", mapId: "홍천군", label: [352, 390] },
  { name: "인제", mapId: "인제군", label: [405, 240] },
  {
    name: "속초",
    mapId: "속초시",
    label: [486, 197],
    labelLetterSpacing: -1.5,
    mapScale: 1.08,
  },
  { name: "양양", mapId: "양양군", label: [525, 275] },
  { name: "원주", mapId: "원주시", label: [295, 585] },
  { name: "횡성", mapId: "횡성군", label: [337, 502] },
  { name: "평창", mapId: "평창군", label: [482, 470] },
  { name: "강릉", mapId: "강릉시", label: [600, 390] },
  { name: "영월", mapId: "영월군", label: [480, 635] },
  { name: "정선", mapId: "정선군", label: [565, 535] },
  { name: "동해", mapId: "동해시", label: [686, 489] },
  { name: "태백", mapId: "태백시", label: [669, 652] },
  { name: "삼척", mapId: "삼척시", label: [725, 580] },
];

const regionByMapId = Object.fromEntries(
  regionMapItems.map((region) => [region.mapId, region.name]),
) as Record<string, GangwonRegion>;

const mapIdByRegion = Object.fromEntries(
  regionMapItems.map((region) => [region.name, region.mapId]),
) as Record<GangwonRegion, string>;

const mapScaleByMapId = Object.fromEntries(
  regionMapItems.map((region) => [region.mapId, region.mapScale ?? 1]),
) as Record<string, number>;

/**
 * TourAPI 법정동 시군구코드(lDongSignguCd). 장소·AI API의 sigungu에 사용한다.
 * 강원 전체 조회는 region="51", 특정 시군 조회는 region="51"과 sigungu를 함께 보낸다.
 */
export const sigunguCodeByRegion: Record<GangwonRegion, string> = {
  춘천: "110",
  원주: "130",
  강릉: "150",
  동해: "170",
  태백: "190",
  속초: "210",
  삼척: "230",
  홍천: "720",
  횡성: "730",
  영월: "750",
  평창: "760",
  정선: "770",
  철원: "780",
  화천: "790",
  양구: "800",
  인제: "810",
  고성: "820",
  양양: "830",
};

type GangwonRegionMapProps = {
  open: boolean;
  selectedRegion: GangwonRegion | null;
  onClose: () => void;
  onSelect: (region: GangwonRegion) => void;
};

const getRegionFromMapTarget = (target: EventTarget): GangwonRegion | null => {
  const element = target as Element;
  return element.tagName?.toLowerCase() === "path"
    ? regionByMapId[element.id] ?? null
    : null;
};

export default function GangwonRegionMap({
  open,
  selectedRegion,
  onClose,
  onSelect,
}: GangwonRegionMapProps) {
  const [hoveredRegion, setHoveredRegion] = useState<GangwonRegion | null>(null);
  const [pendingRegion, setPendingRegion] = useState<GangwonRegion | null>(selectedRegion);

  useEffect(() => {
    if (!open) return undefined;

    setPendingRegion(selectedRegion);
    setHoveredRegion(null);

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose, selectedRegion]);

  if (!open) return null;

  const activeRegion = hoveredRegion ?? pendingRegion;
  const activeMapId = activeRegion ? mapIdByRegion[activeRegion] : null;
  const hoveredMapId = hoveredRegion ? mapIdByRegion[hoveredRegion] : null;
  const activeGuide = activeRegion ? regionGuides[activeRegion] : null;
  const visibleMapPaths = [...gangwonMapPaths].sort((left, right) => {
    const getLayer = (mapId: string) => {
      if (mapId === hoveredMapId) return 2;
      return mapScaleByMapId[mapId] > 1 ? 1 : 0;
    };

    return getLayer(left.id) - getLayer(right.id);
  });

  const handleRegionKeyDown = (
    event: ReactKeyboardEvent<SVGGElement>,
    region: GangwonRegion,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPendingRegion(region);
    }
  };

  const handleMapPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch") return;
    const region = getRegionFromMapTarget(event.target);
    if (region && region !== hoveredRegion) setHoveredRegion(region);
  };

  const handleMapClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const region = getRegionFromMapTarget(event.target);
    if (region) setPendingRegion(region);
  };

  return (
    <div
      className="region-map-overlay fixed inset-0 z-50 flex items-center justify-center bg-foreground/30"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="region-dialog-title"
        className="region-map-dialog relative flex w-full max-w-5xl flex-col overflow-hidden bg-background shadow-[0_16px_48px_hsl(var(--foreground)/0.12)]"
      >
        <div className="region-map-close">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="지역 선택 창 닫기"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="region-map-content">
          <header className="region-map-heading text-center">
            <h2
              id="region-dialog-title"
              className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
            >
              어디로 떠나볼까요?
            </h2>
            <p className="region-map-subtitle text-muted-foreground">
              강원도 18개 시·군 중 여행할 지역을 선택해 주세요.
            </p>
          </header>

          <div className="region-map-layout">
            <div className="region-map-canvas relative overflow-hidden rounded-xl bg-muted/40">
              <style>{`
                #gangwon-boundary-map path {
                  fill: hsl(var(--muted));
                  stroke: hsl(var(--border));
                  stroke-width: 1.5px;
                  vector-effect: non-scaling-stroke;
                  transform-box: fill-box;
                  transform-origin: center;
                  cursor: pointer;
                  transition:
                    fill 180ms ease,
                    stroke 180ms ease,
                    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
                    filter 220ms ease;
                }
                #gangwon-boundary-map path:hover {
                  fill: hsl(var(--primary) / 0.18);
                  stroke: hsl(var(--primary));
                }
                #gangwon-boundary-map path#속초시 {
                  transform: scale(${mapScaleByMapId.속초시});
                }
                ${
                  activeMapId
                    ? `#gangwon-boundary-map path#${activeMapId} {
                        fill: hsl(var(--primary) / 0.72);
                        stroke: hsl(var(--primary));
                        filter: url(#selected-region-shadow);
                      }`
                    : ""
                }
                ${
                  hoveredMapId
                    ? `#gangwon-boundary-map path#${hoveredMapId} {
                        fill: url(#hovered-region-fill);
                        stroke: hsl(var(--primary));
                        stroke-width: 2.25px;
                        transform: translateY(-8px) scale(${(
                          (mapScaleByMapId[hoveredMapId] ?? 1) * 1.018
                        ).toFixed(3)});
                        filter: url(#hovered-region-shadow);
                      }`
                    : ""
                }
              `}</style>

              <div className="region-map-stage relative mx-auto w-full max-w-[620px]">
                <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
                  <defs>
                    <linearGradient id="hovered-region-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity="0.68"
                      />
                      <stop
                        offset="100%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity="0.82"
                      />
                    </linearGradient>
                    <filter id="selected-region-shadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow
                        dx="0"
                        dy="2"
                        stdDeviation="3"
                        floodColor="hsl(var(--primary))"
                        floodOpacity="0.14"
                      />
                    </filter>
                    <filter id="hovered-region-shadow" x="-40%" y="-40%" width="180%" height="195%">
                      <feDropShadow
                        dx="0"
                        dy="2"
                        stdDeviation="1.5"
                        floodColor="hsl(var(--background))"
                        floodOpacity="0.95"
                      />
                      <feDropShadow
                        dx="0"
                        dy="5"
                        stdDeviation="3"
                        floodColor="hsl(var(--foreground))"
                        floodOpacity="0.1"
                      />
                      <feDropShadow
                        dx="0"
                        dy="7"
                        stdDeviation="5"
                        floodColor="hsl(var(--primary))"
                        floodOpacity="0.14"
                      />
                    </filter>
                  </defs>
                </svg>

                <svg
                  id="gangwon-boundary-map"
                  data-testid="gangwon-boundary-map"
                  data-active-region={activeRegion ?? ""}
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 800 699"
                  role="presentation"
                  aria-hidden="true"
                  onPointerMove={handleMapPointerMove}
                  onPointerLeave={() => setHoveredRegion(null)}
                  onClick={handleMapClick}
                >
                  <g>
                    {visibleMapPaths.map((region) => (
                      <path key={region.id} id={region.id} d={region.d} />
                    ))}
                  </g>
                </svg>

                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox="0 0 800 699"
                  role="group"
                  aria-label="강원도 18개 시군 선택 지도"
                >
                  {regionMapItems.map((region) => {
                    const isActive = activeRegion === region.name;
                    const isSelected = pendingRegion === region.name;
                    const isHovered = hoveredRegion === region.name;

                    return (
                      <g
                        key={region.name}
                        role="button"
                        tabIndex={0}
                        aria-label={region.name}
                        aria-pressed={isSelected}
                        className="pointer-events-auto cursor-pointer outline-none"
                        style={{
                          transform: isHovered ? "translateY(-8px)" : "translateY(0)",
                          transformBox: "fill-box",
                          transformOrigin: "center",
                          transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                        }}
                        onPointerEnter={(event) => {
                          if (event.pointerType !== "touch") setHoveredRegion(region.name);
                        }}
                        onPointerDown={(event) => {
                          // Touch selects on click without a focus/hover preview moving the map.
                          if (event.pointerType === "touch") event.preventDefault();
                        }}
                        onPointerLeave={() => setHoveredRegion(null)}
                        onFocus={() => setHoveredRegion(region.name)}
                        onBlur={() => setHoveredRegion(null)}
                        onClick={() => setPendingRegion(region.name)}
                        onKeyDown={(event) => handleRegionKeyDown(event, region.name)}
                      >
                        <rect
                          x={region.label[0] - 30}
                          y={region.label[1] - 18}
                          width="60"
                          height="36"
                          rx="10"
                          fill="transparent"
                        />
                        <text
                          x={region.label[0]}
                          y={region.label[1]}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill={isActive ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))"}
                          fontSize={20}
                          letterSpacing={region.labelLetterSpacing}
                          className="region-map-label pointer-events-none select-none font-semibold transition-colors duration-200"
                        >
                          {region.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <p className="region-map-brand text-center text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
                PlanFix
              </p>
            </div>

            <aside className="region-map-details flex flex-col rounded-xl border border-border/70 bg-background text-foreground">
              <div className="region-map-selection">
                <div className="region-map-icon flex shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
                  <MapPinned className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">선택한 지역</p>
                  <p className="region-map-name font-semibold tracking-tight">
                    {activeRegion ?? "지역을 골라주세요"}
                  </p>
                </div>
              </div>
              <div className="region-map-guide" aria-live="polite">
                {activeGuide ? (
                  <div className="region-map-selected-guide" data-testid="region-guide">
                    <p className="region-map-description text-muted-foreground">
                      {activeGuide.description}
                    </p>
                    <div className="region-map-keywords">
                      <p className="region-map-keyword-title flex items-center gap-1.5 text-xs font-semibold text-foreground">
                        <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
                        여행 키워드
                      </p>
                      <div
                        className="region-map-keyword-list flex flex-wrap gap-1.5"
                        aria-label={`${activeRegion} 여행 키워드`}
                      >
                        {activeGuide.keywords.map((keyword) => (
                          <span
                            key={keyword}
                            className="rounded-full bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                    <dl className="region-map-facts border-t border-border/70 text-xs">
                      <div>
                        <dt className="flex items-center gap-1.5 font-semibold text-foreground sm:gap-2">
                          <Landmark className="h-4 w-4 text-primary" aria-hidden="true" />
                          대표 명소
                        </dt>
                        <dd className="region-map-fact-value text-muted-foreground">
                          {activeGuide.attractions.join(" · ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1.5 font-semibold text-foreground sm:gap-2">
                          <UtensilsCrossed
                            className="h-4 w-4 text-primary"
                            aria-hidden="true"
                          />
                          대표 먹거리
                        </dt>
                        <dd className="region-map-fact-value text-muted-foreground">
                          {activeGuide.foods.join(" · ")}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <p className="region-map-description text-muted-foreground">
                    지도에서 지역을 누르면 선택됩니다. 마우스뿐 아니라 키보드와 터치로도
                    이용할 수 있어요.
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={!pendingRegion}
                onClick={() => {
                  if (pendingRegion) onSelect(pendingRegion);
                }}
                className="region-map-confirm flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {pendingRegion ? `${pendingRegion} 선택하기` : "지역 선택하기"}
              </button>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
