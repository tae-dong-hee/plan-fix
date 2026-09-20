import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CopyPlus, Loader2, MapPin, X } from "lucide-react";

import { formatCourseDuration } from "@/lib/course-duration";
import type { CourseResponse } from "@/services/course";

type CourseImportDialogProps = {
  course: CourseResponse;
  importing: boolean;
  error: string | null;
  onImport: (dayNumbers: number[]) => void;
  onClose: () => void;
};

export default function CourseImportDialog({
  course,
  importing,
  error,
  onImport,
  onClose,
}: CourseImportDialogProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const importingRef = useRef(importing);
  closeRef.current = onClose;
  importingRef.current = importing;
  const orderedDays = useMemo(
    () => [...course.days].sort((left, right) => left.dayNumber - right.dayNumber),
    [course.days],
  );
  const [selectedDays, setSelectedDays] = useState<Set<number>>(
    () => new Set(orderedDays.map((day) => day.dayNumber)),
  );

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !importingRef.current) closeRef.current();
      if (event.key !== "Tab") return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const toggleDay = (dayNumber: number) => {
    if (importing) return;
    setSelectedDays((current) => {
      const next = new Set(current);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  };

  const allSelected = selectedDays.size === orderedDays.length;
  const selectedSpotCount = orderedDays.reduce(
    (total, day) => total + (selectedDays.has(day.dayNumber) ? day.spots.length : 0),
    0,
  );
  const selectedDayNumbers = orderedDays
    .filter((day) => selectedDays.has(day.dayNumber))
    .map((day) => day.dayNumber);
  const canImport = selectedDayNumbers.length > 0 && selectedSpotCount > 0 && !importing;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/35 p-0 backdrop-blur-[5px] sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !importing) onClose();
      }}
    >
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-import-title"
        className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] border border-primary/10 bg-background shadow-2xl outline-none sm:max-h-[calc(100dvh-40px)] sm:rounded-[28px]"
      >
        <div className="relative bg-gradient-to-b from-primary/[0.09] to-transparent px-6 pb-5 pt-7 sm:px-8">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            aria-label="닫기"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition hover:bg-background hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CopyPlus className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id="course-import-title" className="mt-4 text-xl font-bold tracking-tight sm:text-2xl">
            코스 가져오기
          </h2>
          <p className="mt-1.5 break-keep text-sm leading-6 text-muted-foreground">
            내 코스에 담을 일정을 선택해 주세요. 장소 순서와 메모까지 그대로 가져와요.
          </p>
          <p className="mt-3 truncate text-xs font-semibold text-primary">{course.title}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 sm:px-8">
          <div className="sticky top-0 z-10 flex items-center justify-between border-y border-border/60 bg-background/95 py-3 backdrop-blur">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={importing}
                onChange={() => setSelectedDays(allSelected ? new Set() : new Set(orderedDays.map((day) => day.dayNumber)))}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              전체 선택
            </label>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {selectedDayNumbers.length > 0 ? formatCourseDuration(selectedDayNumbers.length) : "일정 미선택"}
            </span>
          </div>

          <div className="space-y-2.5 py-4" role="group" aria-label="가져올 일정 선택">
            {orderedDays.map((day) => {
              const selected = selectedDays.has(day.dayNumber);
              const spotNames = day.spots.map((spot) => spot.title).filter(Boolean).slice(0, 3).join(" · ");
              return (
                <label
                  key={day.dayNumber}
                  className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-primary/35 ${
                    selected
                      ? "border-primary/55 bg-primary/[0.055] ring-1 ring-primary/10"
                      : "border-border bg-background hover:border-primary/25 hover:bg-muted/30"
                  } ${importing ? "cursor-wait opacity-70" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={importing}
                    onChange={() => toggleDay(day.dayNumber)}
                    aria-label={`Day ${day.dayNumber} 일정 선택`}
                    className="sr-only"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <strong className="text-sm">Day {day.dayNumber}</strong>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {day.spots.length}개 장소
                      </span>
                    </span>
                    <span className="mt-1.5 block truncate text-xs leading-5 text-muted-foreground">
                      {spotNames || "등록된 장소가 없는 일정"}
                    </span>
                  </span>
                  <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${selected ? "bg-primary text-primary-foreground" : "border border-border"}`}>
                    {selected && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                  </span>
                </label>
              );
            })}
          </div>

          {selectedDayNumbers.length > 0 && selectedSpotCount === 0 && (
            <p role="alert" className="mb-4 rounded-xl bg-amber-500/10 px-3.5 py-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
              장소가 있는 일정을 한 개 이상 선택해 주세요.
            </p>
          )}
          {error && (
            <div role="alert" className="mb-4 flex gap-2.5 rounded-xl border border-destructive/15 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p className="break-keep text-xs leading-5">{error}</p>
            </div>
          )}
        </div>

        <div className="border-t border-border/70 bg-background px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 sm:px-8 sm:pb-6">
          <p className="mb-3 text-center text-[11px] leading-5 text-muted-foreground">
            가져온 코스는 나만 보기로 저장되며 여행 날짜는 나중에 정할 수 있어요.
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="rounded-xl border border-border px-5 py-3 text-sm font-medium transition hover:bg-muted disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => onImport(selectedDayNumbers)}
              disabled={!canImport}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CopyPlus className="h-4 w-4" aria-hidden="true" />}
              {importing ? "가져오는 중..." : `선택한 ${selectedDayNumbers.length}일 가져오기`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
