import { useEffect } from "react";
import { ArrowRight, MapPinPlus, Sparkles, X } from "lucide-react";

export interface CourseSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelectAi?: () => void;
  onSelectManual: () => void;
}

export default function CourseSelectModal({
  open,
  onClose,
  onSelectAi,
  onSelectManual,
}: CourseSelectModalProps) {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="course-select-backdrop"
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-select-title"
        aria-describedby="course-select-desc"
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl border border-border/70 bg-background p-5 shadow-[0_16px_48px_hsl(var(--foreground)/0.12)] sm:rounded-2xl sm:p-7"
      >
        {/* 모바일 상단 드래그 핸들 */}
        <div className="mx-auto -mt-1 mb-6 h-1 w-9 rounded-full bg-border sm:hidden" />

        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:right-4 sm:top-4"
          aria-label="코스 선택 창 닫기"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <header className="pr-9">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>새로운 여행 계획</span>
          </div>
          <h2
            id="course-select-title"
            className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl"
          >
            여행 코스 만들기
          </h2>
          <p id="course-select-desc" className="mt-2 text-[13px] leading-6 text-muted-foreground">
            어떤 방식으로 여행 일정을 계획해볼까요?
          </p>
        </header>

        <div className="mt-6 grid gap-3">
          {/* AI 코스 생성 버튼 */}
          <button
            type="button"
            onClick={onSelectAi}
            className="group relative flex items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:gap-4 sm:p-5"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[15px] font-semibold text-foreground group-hover:text-primary">
                  AI 코스 생성
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  AI 추천
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                여행 지역과 테마, 일정만 알려주시면 AI가 최적의 동선과 장소를 추천해 드려요.
              </p>
            </div>
            <ArrowRight
              className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          </button>

          {/* 직접 코스 생성 버튼 */}
          <button
            type="button"
            onClick={onSelectManual}
            className="group relative flex items-start gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:gap-4 sm:p-5"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <MapPinPlus className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[15px] font-semibold text-foreground group-hover:text-primary">
                  직접 코스 생성
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  자유 일정
                </span>
              </div>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                강원도의 다양한 인기 명소와 맛집을 직접 골라 Day별로 나만의 특별한 여행 코스를 설계해요.
              </p>
            </div>
            <ArrowRight
              className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
              aria-hidden="true"
            />
          </button>
        </div>
      </section>
    </div>
  );
}
