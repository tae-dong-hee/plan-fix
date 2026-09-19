import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight, CalendarDays, Check, ChevronDown, Coffee, Heart, Landmark,
  Loader2, MapPin, Mountain, Plus, Route, Search, SlidersHorizontal,
  Sparkles, Trees, UserRound, UsersRound, Utensils, Waves, X,
} from "lucide-react";

import { sigunguCodeByRegion, type GangwonRegion } from "@/components/ui/gangwon-region-map";
import {
  fetchAiCourseDraft,
  type AiCourseCompanion,
  type AiCourseDraft,
  type AiCourseTheme,
  type AiCourseTripIdea,
} from "@/services/ai-course";
import { searchSpots, UnauthorizedError, type PopularSpot } from "@/services/spots";
import { TRIP_IDEA_DETAILS, dayThemeFromChoices, describeDayThemes, distributeDayThemeChoices, themeChoices } from "@/lib/ai-trip-themes";
import "./ai-course-modal.css";

const GANGWON_REGION_CODE = "51";
const REGION_OPTIONS = Object.keys(sigunguCodeByRegion) as GangwonRegion[];
const COMPANION_OPTIONS = [
  { value: "SOLO", label: "혼자", summary: "나 혼자", icon: UserRound },
  { value: "COUPLE", label: "연인", summary: "연인과 둘이", icon: Heart },
  { value: "FRIENDS", label: "친구", summary: "친구와 함께", icon: UsersRound },
  { value: "FAMILY", label: "가족(아이 동반)", summary: "아이와 가족이 함께", icon: UsersRound },
] satisfies { value: AiCourseCompanion; label: string; summary: string; icon: typeof Heart }[];
const THEME_OPTIONS: {
  value: AiCourseTheme;
  label: string;
  icon: typeof Trees;
}[] = [
  { value: "HEALING", label: "힐링·자연", icon: Trees },
  { value: "FOOD", label: "맛집 탐방", icon: Utensils },
  { value: "CAFE", label: "카페 투어", icon: Coffee },
  { value: "ACTIVITY", label: "액티비티", icon: Mountain },
  { value: "CULTURE", label: "문화·역사", icon: Landmark },
];
const TRIP_IDEAS: {
  id: AiCourseTripIdea;
  title: string;
  description: string;
  themes: AiCourseTheme[];
  icon: typeof Trees;
  scene: string;
}[] = [
  { id: "COAST_CAFE", title: "바다와 카페", description: "물가의 여유, 커피 한 잔", themes: ["HEALING", "CAFE"], icon: Waves, scene: "coast" },
  { id: "FOOD_WALK", title: "맛집과 산책", description: "맛있게 먹고 가볍게 걷기", themes: ["HEALING", "FOOD"], icon: Utensils, scene: "sunset" },
  { id: "NATURE", title: "자연 속 쉼", description: "초록빛 풍경에 쉬어가기", themes: ["HEALING"], icon: Trees, scene: "forest" },
  { id: "ACTIVITY", title: "신나는 액티비티", description: "몸을 움직이며 기분 전환", themes: ["ACTIVITY"], icon: Mountain, scene: "activity" },
  { id: "CULTURE_LOCAL", title: "문화와 골목 여행", description: "이야기와 로컬 맛집 찾기", themes: ["CULTURE", "FOOD"], icon: Landmark, scene: "culture" },
  { id: "CAFE", title: "여유로운 카페 투어", description: "취향에 맞는 공간 머물기", themes: ["CAFE"], icon: Coffee, scene: "cafe" },
];

type AiCourseModalProps = {
  open: boolean;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onApply: (draft: AiCourseDraft, themes: AiCourseTheme[]) => void;
};

function describeDuration(startDate: string, endDate: string) {
  const nights = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000);
  return nights > 0 ? `${nights}박 ${nights + 1}일` : "당일치기";
}

export default function AiCourseModal({ open, startDate, endDate, onClose, onApply }: AiCourseModalProps) {
  const [region, setRegion] = useState<GangwonRegion | null>(null);
  const [companion, setCompanion] = useState<AiCourseCompanion>("COUPLE");
  const [manualThemes, setManualThemes] = useState<AiCourseTheme[]>([]);
  const [selectedIdeas, setSelectedIdeas] = useState<AiCourseTripIdea[]>([]);
  const [dayOverrides, setDayOverrides] = useState<Record<number, string[]>>({});
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const dayCount = Math.max(1, Math.min(30, Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000) + 1 || 1));
  const [anchors, setAnchors] = useState<PopularSpot[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [anchorKeyword, setAnchorKeyword] = useState("");
  const [anchorResults, setAnchorResults] = useState<PopularSpot[]>([]);
  const [anchorSearching, setAnchorSearching] = useState(false);
  const [anchorSearchError, setAnchorSearchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [takingLonger, setTakingLonger] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const anchorInputRef = useRef<HTMLInputElement>(null);
  const themeButtonRefs = useRef<Partial<Record<AiCourseTheme, HTMLButtonElement | null>>>({});
  const callbacksRef = useRef({ onClose, onApply });
  const requestVersion = useRef(0);
  const requestPending = useRef(false);
  callbacksRef.current = { onClose, onApply };

  const closeModal = useCallback(() => {
    // A dismissed draft must never overwrite the course when its request finishes later.
    requestVersion.current += 1;
    requestPending.current = false;
    setSubmitting(false);
    callbacksRef.current.onClose();
  }, []);

  useEffect(() => {
    if (!open) return;
    setRegion(null);
    setCompanion("COUPLE");
    setManualThemes([]);
    setSelectedIdeas([]);
    setDayOverrides({});
    setEditingDay(null);
    setAnchors([]);
    setDetailsOpen(false);
    setAnchorKeyword("");
    setAnchorResults([]);
    setAnchorSearching(false);
    setAnchorSearchError(null);
    setSubmitting(false);
    setError(null);
    requestPending.current = false;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      }
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      const outside = !dialogRef.current?.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      requestVersion.current += 1;
      requestPending.current = false;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, closeModal]);

  useEffect(() => {
    if (!submitting) {
      setTakingLonger(false);
      return;
    }
    closeButtonRef.current?.focus();
    const timer = setTimeout(() => setTakingLonger(true), 12000);
    return () => clearTimeout(timer);
  }, [submitting]);

  useEffect(() => {
    const keyword = anchorKeyword.trim();
    setAnchorResults([]);
    setAnchorSearchError(null);
    if (!open || !detailsOpen || !keyword || submitting) {
      setAnchorSearching(false);
      return;
    }
    let ignore = false;
    setAnchorSearching(true);
    const timer = setTimeout(() => {
      searchSpots({ keyword, size: 5, region: GANGWON_REGION_CODE })
        .then((res) => {
          if (!ignore) setAnchorResults(res.items ?? []);
        })
        .catch(() => {
          if (!ignore) setAnchorSearchError("장소를 불러오지 못했어요. 검색어를 다시 입력해 주세요.");
        })
        .finally(() => {
          if (!ignore) setAnchorSearching(false);
        });
    }, 300);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [anchorKeyword, open, detailsOpen, submitting]);

  useEffect(() => {
    setDayOverrides((previous) => Object.fromEntries(Object.entries(previous).filter(([day]) => Number(day) <= dayCount)));
    setEditingDay((previous) => previous !== null && previous > dayCount ? null : previous);
  }, [dayCount]);

  if (!open) return null;

  const choices = themeChoices(selectedIdeas, manualThemes);
  const themes = [...new Set(choices.flatMap((choice) => choice.themes))];
  const automaticDays = distributeDayThemeChoices(dayCount, choices);
  const dayChoiceKeys = automaticDays.map((keys, index) => dayOverrides[index + 1] ?? keys);
  const dayThemes = dayChoiceKeys.map((keys, index) => dayThemeFromChoices(index + 1, keys.map((key) => choices.find((choice) => choice.key === key)).filter((choice) => choice !== undefined)));
  const requestThemes = [...new Set(dayThemes.flatMap((day) => day.themes))];

  const companionSummary = COMPANION_OPTIONS.find((option) => option.value === companion)?.summary;
  const selectedThemeOptions = THEME_OPTIONS.filter((option) => themes.includes(option.value));
  const selectedThemeLabels = selectedThemeOptions.map((option) => option.label);
  const duration = describeDuration(startDate, endDate);
  const preferenceSummary = selectedThemeLabels.length ? selectedThemeLabels.join(" · ") : "취향은 AI 추천으로";

  const resetDayAssignments = () => {
    setDayOverrides({});
    setEditingDay(null);
  };

  const resetThemes = () => {
    setSelectedIdeas([]);
    setManualThemes([]);
    resetDayAssignments();
  };

  const toggleIdea = (id: AiCourseTripIdea) => {
    setSelectedIdeas((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
    resetDayAssignments();
  };

  const toggleTheme = (value: AiCourseTheme) => {
    if (themes.includes(value)) {
      const remainingIdeas = selectedIdeas.filter((id) => !TRIP_IDEA_DETAILS[id].themes.includes(value));
      const covered = new Set(remainingIdeas.flatMap((id) => TRIP_IDEA_DETAILS[id].themes));
      setSelectedIdeas(remainingIdeas);
      setManualThemes(themes.filter((theme) => theme !== value && !covered.has(theme)));
    } else {
      setManualThemes((previous) => [...previous, value]);
    }
    resetDayAssignments();
  };

  const removeTheme = (value: AiCourseTheme) => {
    toggleTheme(value);
    themeButtonRefs.current[value]?.focus();
  };

  const toggleDayChoice = (dayNumber: number, key: string) => {
    const current = dayChoiceKeys[dayNumber - 1];
    setDayOverrides((previous) => ({ ...previous, [dayNumber]: current.includes(key) ? current.filter((value) => value !== key) : [...current, key] }));
  };

  const addAnchor = (spot: PopularSpot) => {
    setAnchors((prev) => prev.some((anchor) => anchor.spotId === spot.spotId) ? prev : [...prev, spot]);
    setAnchorKeyword("");
    anchorInputRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (requestPending.current) return;
    requestPending.current = true;
    const version = ++requestVersion.current;
    setSubmitting(true);
    setError(null);
    try {
      const draft = await fetchAiCourseDraft({
        region: GANGWON_REGION_CODE,
        sigungu: region ? sigunguCodeByRegion[region] : undefined,
        startDate,
        endDate,
        themes: requestThemes,
        ...(choices.length ? { dayThemes } : {}),
        companion,
        anchorSpotIds: anchors.map((anchor) => anchor.spotId),
      });
      if (version === requestVersion.current) callbacksRef.current.onApply(draft, requestThemes);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(err instanceof UnauthorizedError
        ? "로그인이 필요한 기능이에요."
        : err instanceof Error ? err.message : "AI 코스를 만들지 못했습니다.");
    } finally {
      if (version === requestVersion.current) {
        requestPending.current = false;
        setSubmitting(false);
      }
    }
  };

  return (
    <div
      className="ai-course-overlay fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-[6px] sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeModal();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-course-title"
        aria-describedby="ai-course-description"
        className="ai-course-dialog relative flex max-h-[94dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-[28px] border border-background/60 bg-background text-foreground shadow-[0_32px_100px_-24px_rgba(34,20,65,0.4)] sm:max-h-[92dvh] sm:rounded-[28px]"
      >
        <header className="relative z-10 flex shrink-0 items-center justify-between px-5 pb-2 pt-5 sm:px-8 sm:pt-6">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <h2 id="ai-course-title" className="text-xs font-bold tracking-wide">AI에게 코스 맡기기</h2>
            <span className="rounded-full border border-primary/15 bg-primary/[0.06] px-1.5 py-0.5 text-[9px] font-bold tracking-wider">AI PLANNER</span>
          </div>
          <button ref={closeButtonRef} type="button" onClick={closeModal} aria-label="창 닫기" className="ai-course-control flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="ai-course-content min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-5 sm:px-8 sm:pb-6">
          {submitting ? (
            <div className="ai-course-enter flex min-h-[450px] flex-col items-center justify-center py-8 text-center" role="status" aria-live="polite">
              <div className="ai-course-orbit" aria-hidden="true">
                <span className="ai-course-orbit-ring" />
                <div className="ai-course-orb"><Sparkles className="h-9 w-9" /></div>
                <span className="ai-course-orbit-star"><Sparkles className="h-4 w-4" /></span>
              </div>
              <p className="mt-6 text-xs font-semibold tracking-[0.18em] text-primary">DESIGNED FOR YOU</p>
              <h3 className="mt-3 text-2xl font-bold tracking-tight">나만의 여행을 그리는 중이에요</h3>
              <p id="ai-course-description" className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
                {takingLonger ? "장소를 꼼꼼히 살펴보느라 조금 더 걸리고 있어요." : "취향에 맞는 장소와 이동 순서를 함께 살펴보고 있어요."}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs text-primary">
                <span className="rounded-full bg-primary/[0.07] px-3 py-1.5">{region ?? "강원 어디든"}</span>
                <span className="rounded-full bg-primary/[0.07] px-3 py-1.5">{duration}</span>
                <span className="rounded-full bg-primary/[0.07] px-3 py-1.5">{companionSummary}</span>
              </div>
              <div className="mt-8 flex w-full max-w-xs items-center gap-3 rounded-2xl border border-primary/10 bg-primary/[0.025] p-4" aria-hidden="true">
                <Route className="h-6 w-6 shrink-0 text-primary/50" />
                <div className="flex-1 space-y-2"><div className="ai-course-shimmer h-2 w-3/4 rounded-full" /><div className="ai-course-shimmer h-2 w-full rounded-full" /></div>
                <Loader2 className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
              </div>
            </div>
          ) : (
            <div className="ai-course-enter">
              <div className="relative pb-6 pt-5 sm:pt-6">
                <div className="ai-course-hero-glow" aria-hidden="true" />
                <div className="relative flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[25px] font-bold leading-[1.45] tracking-[-0.045em] sm:text-[30px]">
                      여행의 설렘만 남겨두세요.<br />
                      <span className="text-primary">코스는 AI가 짜드릴게요.</span>
                    </p>
                    <p id="ai-course-description" className="mt-3 text-xs leading-5 text-muted-foreground sm:text-sm">장소 찾기부터 동선까지, 가볍게 시작하는 나만의 여행.</p>
                  </div>
                  <div className="ai-course-hero-icon hidden shrink-0 min-[420px]:flex" aria-hidden="true">
                    <Sparkles className="h-8 w-8" strokeWidth={1.5} />
                    <span className="absolute -right-1 top-0 rounded-full border border-primary/10 bg-background p-1.5 text-primary"><Plus className="h-3 w-3" /></span>
                  </div>
                </div>
              </div>

              <section className="relative rounded-[20px] border border-primary/20 bg-gradient-to-br from-primary/[0.055] via-background to-primary/[0.025] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-muted-foreground">어디로 떠나시나요?</h3>
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {startDate.replace(/-/g, ".")} ~ {endDate.replace(/-/g, ".")}
                    <span className="font-semibold text-primary">{duration}</span>
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-lg font-semibold tracking-tight sm:text-xl">
                  <div className="relative inline-flex items-center">
                    <MapPin className="pointer-events-none absolute left-3 h-4 w-4 text-primary" aria-hidden="true" />
                    <select aria-label="여행 지역" value={region ?? ""} onChange={(event) => setRegion((event.target.value || null) as GangwonRegion | null)} className="ai-course-control max-w-full appearance-none rounded-xl border border-primary/20 bg-background py-2 pl-9 pr-8 text-base font-bold text-primary shadow-sm">
                      <option value="">강원 어디든</option>
                      {REGION_OPTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  </div>
                  <span>{region ? "에서" : "좋아요,"}</span>
                  <span>{companionSummary} 떠날래요.</span>
                </div>
                <div className="mt-4 flex items-start gap-2 border-t border-primary/10 pt-3 text-xs leading-5 text-muted-foreground" aria-live="polite">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <p>{selectedThemeLabels.length ? `${choices.map((choice) => choice.label).join(" · ")} 취향을 날짜별로 나눠 담을게요. 각 날의 테마에 맞춰 장소와 동선을 구성해 드려요.` : `${region ?? "강원"}에서 ${duration} 동안 즐길 장소와 동선을 AI가 골라드릴게요.`}{anchors.length > 0 && ` 꼭 갈 장소 ${anchors.length}곳도 함께 담을게요.`}</p>
                </div>
              </section>

              <section className="mt-6" aria-labelledby="ai-course-themes-title" aria-describedby="ai-course-themes-description">
                <div className="mb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 id="ai-course-themes-title" className="text-sm font-semibold">이번 여행, 이렇게 시작해볼까요?</h3>
                    <span className="rounded-full bg-primary/[0.07] px-2 py-1 text-[10px] font-semibold text-primary">AI 여행 제안</span>
                  </div>
                  <p id="ai-course-themes-description" className="mt-1.5 text-xs leading-5 text-muted-foreground">마음에 드는 테마를 여러 개 골라주세요. 날짜별로 나눠 담아드려요.</p>
                </div>

                <button type="button" aria-label="AI에게 테마 맡기기" aria-pressed={themes.length === 0} onClick={resetThemes} className={`ai-course-control ai-course-auto flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors ${themes.length === 0 ? "border-primary/40 bg-primary/[0.06]" : "border-border/80 bg-background hover:border-primary/30"}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">테마도 AI에게 맡길게요</span>
                    <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">지역과 일정에 맞춰 어울리는 장소를 골라드려요.</span>
                  </span>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${themes.length === 0 ? "border-primary bg-primary text-white" : "border-border"}`} aria-hidden="true">{themes.length === 0 && <Check className="h-3 w-3" />}</span>
                </button>

                <div className="ai-course-ideas-grid mt-3" role="group" aria-label="여행 분위기 제안">
                  {TRIP_IDEAS.map((idea) => {
                    const selected = selectedIdeas.includes(idea.id);
                    const Icon = idea.icon;
                    return (
                      <button key={idea.title} type="button" aria-label={idea.title} aria-pressed={selected} onClick={() => toggleIdea(idea.id)} className={`ai-course-control ai-course-idea group relative min-w-0 rounded-2xl border p-3.5 text-left transition-colors ${selected ? "border-primary bg-primary/[0.035] shadow-[0_0_0_1px_hsl(var(--primary))]" : "border-border/80 bg-background hover:border-primary/40 hover:bg-primary/[0.02]"}`}>
                        <span className={`ai-course-idea-icon ai-course-scene-${idea.scene}`} aria-hidden="true"><Icon className="h-5 w-5" strokeWidth={1.6} /></span>
                        {selected && <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true"><Check className="h-3 w-3" /></span>}
                        <span className="mt-2.5 block text-[13px] font-bold leading-5">{idea.title}</span>
                        <span className="mt-1 block text-[11px] leading-[1.6] text-muted-foreground">{idea.description}</span>
                      </button>
                    );
                  })}
                </div>

                {choices.length > 0 && (
                  <section className="mt-4 overflow-hidden rounded-2xl border border-primary/15 bg-primary/[0.025]" aria-labelledby="ai-course-days-title">
                    <div className="flex items-start gap-2.5 px-3.5 pb-3 pt-4">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <h4 id="ai-course-days-title" className="text-xs font-bold">날짜별로 이렇게 담을게요</h4>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">각 날짜의 테마를 바꿀 수 있어요. 한 날에 여러 개도 가능해요.</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">{choices.length}개 선택</span>
                    </div>
                    <ol className="divide-y divide-primary/10 border-t border-primary/10">
                      {dayThemes.map((day, index) => {
                        const expanded = editingDay === day.dayNumber;
                        const dayDate = new Date(Date.parse(startDate) + index * 86400000);
                        const dateLabel = Number.isNaN(dayDate.getTime()) ? "" : dayDate.toISOString().slice(5, 10).replace("-", ".");
                        return (
                          <li key={day.dayNumber}>
                            <button type="button" aria-label={`${day.dayNumber}일차 테마 변경`} aria-expanded={expanded} aria-controls={`ai-day-theme-${day.dayNumber}`} onClick={() => setEditingDay(expanded ? null : day.dayNumber)} className="ai-course-control flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-primary/[0.04]">
                              <span className="flex w-11 shrink-0 flex-col gap-0.5"><span className="text-xs font-bold text-primary">{day.dayNumber}일차</span><span className="text-[10px] text-muted-foreground">{dateLabel}</span></span>
                              <span className="min-w-0 flex-1 text-xs font-medium leading-5">{describeDayThemes(day)}</span>
                              <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
                            </button>
                            {expanded && (
                              <div id={`ai-day-theme-${day.dayNumber}`} role="group" aria-label={`${day.dayNumber}일차 테마`} className="flex flex-wrap gap-1.5 px-3.5 pb-3.5">
                                <button type="button" aria-label={`${day.dayNumber}일차 AI 추천`} aria-pressed={dayChoiceKeys[index].length === 0} onClick={() => setDayOverrides((previous) => ({ ...previous, [day.dayNumber]: [] }))} className={`ai-course-control rounded-lg border px-2.5 py-2 text-[11px] ${dayChoiceKeys[index].length === 0 ? "border-primary/40 bg-primary/10 font-semibold text-primary" : "border-border bg-background text-muted-foreground"}`}>AI 추천</button>
                                {choices.map((choice) => {
                                  const selected = dayChoiceKeys[index].includes(choice.key);
                                  return <button key={choice.key} type="button" aria-label={`${day.dayNumber}일차 ${choice.label}`} aria-pressed={selected} onClick={() => toggleDayChoice(day.dayNumber, choice.key)} className={`ai-course-control inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] ${selected ? "border-primary/40 bg-primary/10 font-semibold text-primary" : "border-border bg-background text-muted-foreground"}`}>{selected ? <Check className="h-3 w-3 shrink-0" aria-hidden="true" /> : <Plus className="h-3 w-3 shrink-0" aria-hidden="true" />}{choice.label}</button>;
                                })}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                    <p className="border-t border-primary/10 px-3.5 py-2.5 text-[10px] leading-4 text-muted-foreground">위에서 테마를 추가하거나 빼면 선택한 순서로 다시 배치해요.</p>
                  </section>
                )}

                <div role="group" aria-labelledby="ai-course-selected-themes" className="mt-4 rounded-xl bg-muted/40 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold"><span id="ai-course-selected-themes">선택한 테마</span> <span className="ml-1 text-primary">{selectedThemeOptions.length}개</span></span>
                    <span className="text-muted-foreground">취향을 더하거나 빼도 좋아요</span>
                  </div>
                  <div className="mt-2 flex min-h-7 flex-wrap items-center gap-1.5" aria-live="polite">
                    {selectedThemeOptions.length ? selectedThemeOptions.map(({ value, label }) => (
                      <button key={value} type="button" aria-label={`${label} 선택 해제`} onClick={() => removeTheme(value)} className="ai-course-control inline-flex min-h-8 items-center gap-1.5 rounded-full border border-primary/20 bg-background px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10">
                        {label}<X className="h-3 w-3 shrink-0" aria-hidden="true" />
                      </button>
                    )) : <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />테마도 AI에게 맡겼어요.</p>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                    {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                      const selected = themes.includes(value);
                      return (
                        <button key={value} ref={(element) => { themeButtonRefs.current[value] = element; }} type="button" aria-label={label} aria-pressed={selected} onClick={() => toggleTheme(value)} className={`ai-course-control inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[11px] transition-colors ${selected ? "border-primary/30 bg-primary/[0.06] font-semibold text-primary" : "border-border bg-background text-muted-foreground hover:border-primary/30"}`}>
                          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="mt-5 rounded-2xl border border-border/80">
                <button type="button" aria-expanded={detailsOpen} aria-controls="ai-course-preferences" onClick={() => setDetailsOpen((prev) => !prev)} className="ai-course-control flex w-full items-center gap-2.5 rounded-2xl px-4 py-3.5 text-left transition-colors hover:bg-muted/50">
                  <SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="text-xs font-semibold">취향 더 알려주기</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{detailsOpen ? "선택한 만큼 더 나답게" : `${companionSummary} · ${preferenceSummary}`}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${detailsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                {detailsOpen && (
                  <div id="ai-course-preferences" className="ai-course-enter space-y-5 border-t border-border/70 p-4">
                    <fieldset>
                      <legend className="text-xs font-semibold">누구와 함께하나요?</legend>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {COMPANION_OPTIONS.map(({ value, label, icon: Icon }) => (
                          <button key={value} type="button" aria-pressed={companion === value} onClick={() => setCompanion(value)} className={`ai-course-control flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors ${companion === value ? "border-primary/35 bg-primary/[0.08] font-semibold text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />{label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div>
                      <label htmlFor="ai-course-anchor" className="text-xs font-semibold">꼭 가고 싶은 곳도 담아둘까요? <span className="ml-1 font-normal text-muted-foreground">선택</span></label>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">이 장소를 포함해 주변으로 코스를 구성해 드릴게요.</p>
                      {anchors.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {anchors.map((anchor) => (
                            <span key={anchor.spotId} className="flex max-w-full items-center gap-1 rounded-lg bg-primary/[0.08] py-1 pl-2.5 pr-1 text-xs font-medium text-primary">
                              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{anchor.title}</span>
                              <button type="button" onClick={() => setAnchors((prev) => prev.filter((spot) => spot.spotId !== anchor.spotId))} aria-label={`${anchor.title} 고정 해제`} className="ai-course-control flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-primary/10"><X className="h-3 w-3" aria-hidden="true" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="relative mt-2.5">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <input ref={anchorInputRef} id="ai-course-anchor" type="text" value={anchorKeyword} onChange={(event) => setAnchorKeyword(event.target.value)} placeholder="장소 이름으로 검색 (예: 경포해변)" aria-label="고정할 장소 검색" autoComplete="off" className="ai-course-control w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-xs placeholder:text-muted-foreground" />
                      </div>
                      <div aria-live="polite">
                        {anchorSearching && <p className="mt-2 text-xs text-muted-foreground">검색 중...</p>}
                        {anchorSearchError && <p className="mt-2 text-xs text-destructive">{anchorSearchError}</p>}
                        {!anchorSearching && !anchorSearchError && anchorKeyword.trim() && anchorResults.length === 0 && <p className="mt-2 text-xs text-muted-foreground">검색 결과가 없어요. 다른 장소 이름을 입력해 보세요.</p>}
                      </div>
                      {anchorResults.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {anchorResults.map((spot) => {
                            const added = anchors.some((anchor) => anchor.spotId === spot.spotId);
                            return (
                              <li key={spot.spotId}>
                                <button type="button" disabled={added} onClick={() => addAnchor(spot)} className="ai-course-control flex w-full items-center gap-2 rounded-xl border border-border p-3 text-left text-xs hover:border-primary/40 hover:bg-primary/[0.03] disabled:opacity-50">
                                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1 truncate font-medium">{spot.title}</span><span className="text-[10px] text-muted-foreground">{added ? "담았어요" : spot.category}</span>{added ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </section>
              {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-xs font-medium leading-5 text-destructive">{error}</p>}
            </div>
          )}
        </div>

        <footer className="relative shrink-0 border-t border-border/70 bg-background px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pb-5">
          <button type="button" onClick={handleSubmit} disabled={submitting} className="ai-course-control ai-course-submit flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-bold text-white transition duration-200 hover:brightness-105 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70 motion-reduce:transform-none">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />코스 짜는 중...</> : <><Sparkles className="h-4 w-4" aria-hidden="true" />AI로 코스 만들기<ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" /></>}
          </button>
          <p className="mt-2.5 text-center text-[11px] text-muted-foreground">{submitting ? "창을 닫으면 이번 코스는 적용되지 않아요." : "완성된 코스는 자유롭게 수정할 수 있어요."}</p>
        </footer>
      </section>
    </div>
  );
}
