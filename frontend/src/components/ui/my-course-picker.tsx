import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Loader2, MapPin, Route, Search, X } from "lucide-react";
import type { CourseResponse } from "@/services/course";

interface MyCoursePickerProps {
  courses: CourseResponse[];
  value: number | null;
  onChange: (courseId: number | null) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function coursePlaces(course: CourseResponse) {
  return course.days.flatMap((day) => day.spots);
}

function courseDates(course: CourseResponse) {
  const dates = [course.startDate, course.endDate].filter((date): date is string => Boolean(date));
  return [...new Set(dates)].map((date) => date.slice(0, 10).replace(/-/g, ".")).join(" — ") || "여행 날짜 미정";
}

function CourseCover({ course }: { course: CourseResponse }) {
  const source = course.thumbnail || coursePlaces(course).find((spot) => spot.thumbnail)?.thumbnail;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-violet-200/40">
      {source && failedSource !== source ? (
        <img src={source} alt="" loading="lazy" onError={() => setFailedSource(source)} className="h-full w-full object-cover" />
      ) : (
        <div aria-hidden="true" className="flex items-center gap-3 text-primary/45">
          <MapPin className="h-6 w-6" />
          <span className="w-8 border-t-2 border-dashed border-primary/30" />
          <Route className="h-10 w-10" />
        </div>
      )}
    </div>
  );
}

function CourseDetails({ course }: { course: CourseResponse }) {
  const places = coursePlaces(course);
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <p className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0" />{courseDates(course)}</p>
      <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0" />장소 {places.length}곳<span className="px-1 text-border">|</span>{course.days.length ? `${course.days.length}일 코스` : "일정 미정"}</p>
      <p className="line-clamp-2 break-words leading-relaxed text-foreground/75">
        {places.length ? places.slice(0, 3).map((place) => place.title || "여행 장소").join(" → ") : "아직 담은 장소가 없어요"}
        {places.length > 3 && ` 외 ${places.length - 3}곳`}
      </p>
    </div>
  );
}

function CoursePickerDialog({ courses, value, loading, error, onRetry, onChange, onClose }: MyCoursePickerProps & { onClose: () => void }) {
  const [draftId, setDraftId] = useState(value);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const descriptionId = useId();
  const radioName = useId();
  const selectedCourse = courses.find((course) => course.courseId === draftId);
  const search = query.trim().toLocaleLowerCase();
  const filteredCourses = courses.filter((course) =>
    [course.title, ...coursePlaces(course).map((spot) => spot.title || "")].join(" ").toLocaleLowerCase().includes(search),
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    searchRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
      ) || []).filter((element) => !(element instanceof HTMLInputElement && element.type === "radio") ||
        element === dialogRef.current?.querySelector('input[type="radio"]:checked') ||
        (!dialogRef.current?.querySelector('input[type="radio"]:checked') && element === dialogRef.current?.querySelector('input[type="radio"]')));
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-panel sm:rounded-3xl">
        <div className="shrink-0 border-b border-border/70 px-5 pb-5 pt-6 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold tracking-widest text-primary">MY TRAVEL COURSE</span>
              <h2 id={titleId} className="mt-1 text-xl font-extrabold text-foreground sm:text-2xl">내 코스 선택하기</h2>
              <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-muted-foreground">여행 이야기에 담을 코스를 골라주세요.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="코스 선택 닫기" className={`rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground ${focusStyle}`}><X className="h-5 w-5" /></button>
          </div>
          <div className="relative mt-5">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input ref={searchRef} type="search" aria-label="내 코스 검색" placeholder="코스 이름이나 방문 장소로 검색" value={query} onChange={(event) => setQuery(event.target.value)} className={`w-full rounded-xl border border-border bg-muted/50 py-3 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground ${focusStyle}`} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
          {loading ? (
            <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin text-primary" />내 코스를 불러오고 있어요.</div>
          ) : error ? (
            <div className="py-12 text-center"><p role="alert" className="text-sm text-muted-foreground">{error}</p><button type="button" onClick={onRetry} className={`mt-4 rounded-xl bg-primary/10 px-5 py-2.5 text-sm font-bold text-primary ${focusStyle}`}>다시 불러오기</button></div>
          ) : courses.length === 0 ? (
            <div className="py-12 text-center"><Route className="mx-auto mb-4 h-9 w-9 text-primary/50" /><p className="font-bold text-foreground">아직 저장한 내 코스가 없어요</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">내가 만든 코스가 여기에 표시돼요.<br />코스를 연결하지 않아도 여행기를 쓸 수 있어요.</p></div>
          ) : filteredCourses.length === 0 ? (
            <div role="status" className="py-12 text-center"><p className="font-bold text-foreground">검색한 코스가 없어요</p><p className="mt-2 text-sm text-muted-foreground">다른 코스 이름이나 장소를 입력해 보세요.</p><button type="button" onClick={() => setQuery("")} className={`mt-4 rounded-lg px-3 py-2 text-sm font-bold text-primary ${focusStyle}`}>검색 초기화</button></div>
          ) : (
            <fieldset>
              <legend className="mb-3 text-xs font-medium text-muted-foreground">내 코스 <span className="font-bold text-primary">{filteredCourses.length}</span>개</legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {filteredCourses.map((course) => {
                  const selected = draftId === course.courseId;
                  return (
                    <label key={course.courseId} className="relative min-w-0 cursor-pointer">
                      <input type="radio" name={radioName} value={course.courseId} checked={selected} onChange={() => setDraftId(course.courseId)} aria-label={course.title} className="peer sr-only" />
                      <div className={`h-full overflow-hidden rounded-2xl border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background ${selected ? "border-primary bg-primary/5 shadow-sm" : "border-border/70 bg-background hover:border-primary/40 hover:shadow-sm"}`}>
                        <div className="relative h-36 sm:h-40">
                          <CourseCover course={course} />
                          <span aria-hidden="true" className={`absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border-2 shadow-sm ${selected ? "border-primary bg-primary text-white" : "border-white bg-white/90 text-transparent"}`}><Check className="h-4 w-4" /></span>
                          <span className="absolute bottom-3 left-3 rounded-full bg-background/95 px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm">{course.days.length ? `${course.days.length}일 여행` : "나의 여행"}</span>
                        </div>
                        <div className="space-y-3 p-4"><h3 className="line-clamp-2 break-words text-base font-bold leading-snug text-foreground">{course.title}</h3><CourseDetails course={course} /></div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-background px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-7">
          <p aria-live="polite" className="mb-3 truncate text-xs text-muted-foreground">{selectedCourse ? <><span className="font-bold text-primary">선택한 코스</span> · {selectedCourse.title}</> : "연결할 코스를 선택해 주세요."}</p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={`rounded-xl border border-border px-5 py-3 text-sm font-bold text-muted-foreground transition hover:bg-muted ${focusStyle}`}>취소</button>
            <button type="button" disabled={!selectedCourse || loading || Boolean(error)} onClick={() => { if (selectedCourse) { onChange(selectedCourse.courseId); onClose(); } }} className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 ${focusStyle}`}><Check className="h-4 w-4" />이 코스 연결하기</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function MyCoursePicker(props: MyCoursePickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previouslyOpenRef = useRef(false);
  useEffect(() => {
    if (previouslyOpenRef.current && !open) triggerRef.current?.focus();
    previouslyOpenRef.current = open;
  }, [open]);
  const selectedCourse = props.courses.find((course) => course.courseId === props.value);
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="flex items-center gap-3 px-5 pt-5 sm:px-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Route className="h-5 w-5" /></span>
        <div><h2 id={titleId} className="text-sm font-bold text-foreground">내 여행 코스 연결 <span className="ml-1 text-xs font-normal text-muted-foreground">(선택)</span></h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">내가 다녀온 코스를 여행 이야기와 함께 담아보세요.</p></div>
      </div>
      {selectedCourse ? (
        <div className="p-5 sm:p-6">
          <div className="overflow-hidden rounded-xl border border-primary/20 bg-background sm:flex">
            <div className="h-40 shrink-0 sm:h-auto sm:w-44"><CourseCover key={selectedCourse.courseId} course={selectedCourse} /></div>
            <div className="min-w-0 flex-1 p-4">
              <span className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary"><CheckCircle2 className="h-3.5 w-3.5" />연결된 코스</span>
              <h3 className="mb-3 break-words text-base font-bold text-foreground">{selectedCourse.title}</h3>
              <CourseDetails course={selectedCourse} />
              <div className="mt-4 flex items-center gap-2"><button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={`rounded-lg bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition hover:bg-primary/15 ${focusStyle}`}>코스 변경<ChevronRight className="ml-1 inline h-3.5 w-3.5" /></button><button type="button" onClick={() => props.onChange(null)} className={`rounded-lg px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted ${focusStyle}`}>연결 해제</button></div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">아래의 장소 버튼을 누르면 본문에 코스의 장소를 넣을 수 있어요.</p>
        </div>
      ) : (
        <div className="p-5 sm:p-6">
          <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={`group flex w-full items-center gap-4 rounded-xl border border-dashed border-primary/35 bg-background/70 p-4 text-left transition hover:border-primary hover:bg-primary/5 ${focusStyle}`}>
            <span className="hidden h-14 w-16 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-primary/5 text-primary sm:flex"><MapPin className="h-6 w-6" /></span>
            <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-primary">내 코스 선택하기</span><span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground">사진과 방문 장소를 보고 코스를 골라보세요.</span></span>
            <ArrowRight className="h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-1" />
          </button>
        </div>
      )}
      {open && <CoursePickerDialog {...props} onClose={() => setOpen(false)} />}
    </section>
  );
}
