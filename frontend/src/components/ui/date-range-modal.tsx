import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { formatCourseDuration } from "@/lib/course-duration";

type DateRangeModalProps = {
  open: boolean;
  startDate: string;
  endDate: string;
  onClose: () => void;
  onApply: (startDate: string, endDate: string) => void;
};

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseISODate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildMonthGrid(viewMonth: Date): (Date | null)[][] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function describeDuration(startStr: string, endStr: string): string {
  const diffDays = Math.round(
    (parseISODate(endStr).getTime() - parseISODate(startStr).getTime()) / 86400000,
  );
  return formatCourseDuration(diffDays + 1);
}

/**
 * 시작일/종료일을 캘린더 하나에서 선택하는 범위 선택 모달.
 * 첫 클릭은 시작일, 두 번째 클릭은 종료일(시작일보다 이전이면 새로 시작일로 다시 잡음).
 */
export default function DateRangeModal({ open, startDate, endDate, onClose, onApply }: DateRangeModalProps) {
  const [pendingStart, setPendingStart] = useState(startDate);
  const [pendingEnd, setPendingEnd] = useState<string | null>(endDate);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() => parseISODate(startDate || formatISODate(new Date())));

  useEffect(() => {
    if (!open) return undefined;

    setPendingStart(startDate);
    setPendingEnd(endDate);
    setHoveredDate(null);
    setViewMonth(parseISODate(startDate || formatISODate(new Date())));

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
  }, [open, onClose, startDate, endDate]);

  if (!open) return null;

  const handleDayClick = (dateStr: string) => {
    if (!pendingStart || pendingEnd) {
      setPendingStart(dateStr);
      setPendingEnd(null);
      return;
    }
    if (dateStr < pendingStart) {
      setPendingStart(dateStr);
      setPendingEnd(null);
      return;
    }
    setPendingEnd(dateStr);
  };

  const previewEnd = pendingEnd ?? (hoveredDate && hoveredDate >= pendingStart ? hoveredDate : null);
  const canApply = Boolean(pendingStart && pendingEnd);
  const weeks = buildMonthGrid(viewMonth);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 backdrop-blur-[3px] sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="date-range-dialog-title"
        className="relative flex h-dvh w-full max-w-sm flex-col overflow-hidden bg-background shadow-[0_28px_80px_hsl(var(--foreground)/0.24)] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-border"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 id="date-range-dialog-title" className="text-base font-semibold text-foreground">
            여행 기간 선택
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="여행 기간 선택 창 닫기"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-center text-sm text-muted-foreground" aria-live="polite">
            {pendingStart && previewEnd
              ? describeDuration(pendingStart, previewEnd)
              : pendingStart
                ? "도착일을 선택해주세요"
                : "출발일을 선택해주세요"}
          </p>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((prev) => addMonths(prev, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="이전 달"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold text-foreground">
              {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((prev) => addMonths(prev, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="다음 달"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center text-xs text-muted-foreground">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label} className="py-1.5">
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {weeks.flatMap((week, weekIndex) =>
              week.map((date, dayIndex) => {
                const key = `${weekIndex}-${dayIndex}`;
                if (!date) return <div key={key} />;

                const dateStr = formatISODate(date);
                const isStart = dateStr === pendingStart;
                const isEnd = Boolean(previewEnd && dateStr === previewEnd);
                const isInRange = Boolean(
                  previewEnd && dateStr > pendingStart && dateStr < previewEnd,
                );
                const isEdge = isStart || isEnd;

                return (
                  <div key={key} className={isInRange ? "bg-primary/10" : isStart && previewEnd ? "rounded-l-full bg-primary/10" : isEnd ? "rounded-r-full bg-primary/10" : ""}>
                    <button
                      type="button"
                      onClick={() => handleDayClick(dateStr)}
                      onMouseEnter={() => setHoveredDate(dateStr)}
                      className={`flex h-9 w-full items-center justify-center rounded-full text-sm transition-colors ${
                        isEdge
                          ? "bg-primary font-semibold text-primary-foreground"
                          : "text-foreground hover:bg-muted"
                      }`}
                      aria-pressed={isEdge}
                      aria-label={`${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`}
                    >
                      {date.getDate()}
                    </button>
                  </div>
                );
              }),
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canApply}
            onClick={() => {
              if (pendingStart && pendingEnd) onApply(pendingStart, pendingEnd);
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            적용
          </button>
        </div>
      </section>
    </div>
  );
}
