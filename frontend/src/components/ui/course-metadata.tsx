import { CalendarDays, Coffee, Compass, Landmark, Leaf, Mountain, Route, Sparkles, UtensilsCrossed } from "lucide-react";

import { formatCourseDuration } from "@/lib/course-duration";
import type { AiCourseTheme } from "@/services/ai-course";
import type { CourseGenerationSource } from "@/services/course";

type CourseMetadataProps = {
  generatedBy?: CourseGenerationSource | null;
  themes?: AiCourseTheme[] | null;
  className?: string;
};

const themeDetails = {
  HEALING: { label: "힐링·자연", icon: Leaf },
  FOOD: { label: "맛집 탐방", icon: UtensilsCrossed },
  CAFE: { label: "카페 투어", icon: Coffee },
  ACTIVITY: { label: "액티비티", icon: Mountain },
  CULTURE: { label: "문화·역사", icon: Landmark },
} satisfies Record<AiCourseTheme, { label: string; icon: typeof Leaf }>;

const compactThemeDetails = {
  HEALING: { label: "힐링·자연", color: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  FOOD: { label: "맛집", color: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  CAFE: { label: "카페", color: "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300" },
  ACTIVITY: { label: "액티비티", color: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  CULTURE: { label: "문화·역사", color: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300" },
} satisfies Record<AiCourseTheme, { label: string; color: string }>;

/** Compact hierarchy for discovery cards; other course views keep their full badges. */
export function CourseCardSummary({ generatedBy, dayCount, className = "" }: {
  generatedBy?: CourseGenerationSource | null;
  dayCount: number;
  className?: string;
}) {
  const isAi = generatedBy === "LLM";
  const hasSource = isAi || generatedBy === "RULE_BASED";
  const SourceIcon = isAi ? Sparkles : Compass;

  return (
    <div className={`flex h-6 min-w-0 items-center gap-2.5 whitespace-nowrap ${className}`}>
      {hasSource && (
        <>
          <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold ${isAi ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
            <SourceIcon className="h-3 w-3" aria-hidden="true" />
            {isAi ? "AI 생성" : "맞춤 추천"}
          </span>
          <span className="h-3 w-px shrink-0 bg-zinc-200 dark:bg-zinc-700" aria-hidden="true" />
        </>
      )}
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
        <strong className="font-semibold text-zinc-800 dark:text-zinc-100">{formatCourseDuration(dayCount)}</strong>
      </span>
    </div>
  );
}

export function CourseThemeLine({ themes, className = "" }: Pick<CourseMetadataProps, "themes" | "className">) {
  const selectedThemes = [...new Set(themes ?? [])].filter((theme) => Object.prototype.hasOwnProperty.call(themeDetails, theme));
  if (selectedThemes.length === 0) return null;
  const description = selectedThemes.map((theme) => themeDetails[theme].label).join(" · ");

  return (
    <div role="group" aria-label={`선택한 테마: ${description}`} title={description} className={`overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-6 ${className}`}>
      {selectedThemes.map((theme) => (
        <span key={theme} className={`mr-1 inline-block rounded-md px-1.5 align-middle text-[10.5px] font-medium leading-[22px] last:mr-0 ${compactThemeDetails[theme].color}`}>
          {compactThemeDetails[theme].label}
        </span>
      ))}
    </div>
  );
}

export function CourseGenerationBadge({
  generatedBy,
  variant = "default",
  className = "",
}: {
  generatedBy?: CourseGenerationSource | null;
  variant?: "default" | "compact";
  className?: string;
}) {
  const isAi = generatedBy === "LLM";
  if (!isAi && generatedBy !== "RULE_BASED") return null;

  const Icon = isAi ? Sparkles : Compass;

  return (
    <span className={`inline-flex w-fit max-w-full shrink-0 items-center gap-2 whitespace-nowrap border px-3 text-xs font-semibold leading-4 ${
      isAi
        ? "border-white/20 bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_4px_12px_-4px_rgba(109,40,217,0.5)]"
        : "border-border/60 bg-background/95 text-foreground shadow-sm"
    } ${variant === "compact" ? "h-8 rounded-full" : "rounded-xl py-2"} ${className}`}>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      {isAi ? (variant === "compact" ? "AI 생성" : "AI로 만든 코스") : (variant === "compact" ? "맞춤 추천" : "맞춤 추천 코스")}
    </span>
  );
}

export function CourseSummaryBadges({ generatedBy, dayCount, className = "" }: {
  generatedBy?: CourseGenerationSource | null;
  dayCount: number;
  className?: string;
}) {
  return (
    <div role="group" aria-label="코스 생성 방식과 여행 기간" className={`flex flex-wrap items-center gap-2 ${className}`}>
      <CourseGenerationBadge generatedBy={generatedBy} variant="compact" />
      <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/15 bg-primary/5 px-3 text-xs font-semibold leading-4 text-primary">
        <Route className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {formatCourseDuration(dayCount)}
      </span>
    </div>
  );
}

export default function CourseMetadata({ generatedBy, themes, className = "" }: CourseMetadataProps) {
  const selectedThemes = [...new Set(themes ?? [])].filter((theme) => Object.prototype.hasOwnProperty.call(themeDetails, theme));
  const hasSource = generatedBy === "LLM" || generatedBy === "RULE_BASED";

  if (!hasSource && selectedThemes.length === 0) return null;

  return (
    <div role="group" aria-label="코스 생성 방식과 선택한 테마" className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <CourseGenerationBadge generatedBy={generatedBy} />
      {selectedThemes.length > 0 && <span className="sr-only">선택한 테마:</span>}
      {selectedThemes.map((theme) => {
        const { label, icon: Icon } = themeDetails[theme];
        return (
          <span key={theme} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/65 px-2.5 py-1.5 text-xs font-medium leading-4 text-muted-foreground">
            <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} aria-hidden="true" />
            {label}
          </span>
        );
      })}
    </div>
  );
}
