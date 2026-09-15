import { Coffee, Compass, Landmark, Leaf, Mountain, Route, Sparkles, UtensilsCrossed } from "lucide-react";

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
        {dayCount}일 일정
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
