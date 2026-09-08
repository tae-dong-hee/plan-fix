import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check, ChevronRight, Eye, MapPin, Pencil, Route, UsersRound } from "lucide-react";
import { isSharingPreviewCourse, sampleSharingCourse, type CourseSharingPreviewState } from "@/data/course-sharing-preview";

export default function CourseInvitationPage() {
  const location = useLocation();
  const preview = location.state as CourseSharingPreviewState | null;
  const suppliedCourse = isSharingPreviewCourse(preview?.previewCourse) ? preview.previewCourse : null;
  const course = suppliedCourse ?? sampleSharingCourse;
  const isSample = suppliedCourse === null;
  const canEdit = preview?.previewPermission === "EDITOR";
  const [confirmed, setConfirmed] = useState(false);
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const cover = course.thumbnail || course.days.flatMap((day) => day.spots).find((spot) => spot.thumbnail)?.thumbnail;

  useEffect(() => {
    setConfirmed(false);
    setFailedCover(null);
  }, [location.key]);

  return (
    <div className="min-h-dvh bg-muted/20 pb-12">
      <header className="border-b border-border/60 bg-background/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
          <Link to="/main" className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-primary" aria-label="PlanFix 홈">
            <img src="/logo.png" alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-lg bg-black object-cover" />PlanFix
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><UsersRound className="h-4 w-4" aria-hidden="true" />여행 코스 초대</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-7 sm:px-6 sm:pt-10">
        <Link to="/main" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />홈으로</Link>

          <div className="mt-5 space-y-6">
            <section className="overflow-hidden rounded-3xl border border-primary/15 bg-background shadow-panel" aria-labelledby="invitation-course-title">
              <div className="relative h-48 overflow-hidden bg-gradient-to-br from-primary/20 via-violet-100/70 to-primary/5 sm:h-64">
                {cover && failedCover !== cover ? <img src={cover} alt={`${course.title} 대표 사진`} referrerPolicy="no-referrer" onError={() => setFailedCover(cover)} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center gap-7 text-primary/40" aria-hidden="true"><MapPin className="h-10 w-10 -translate-y-3" strokeWidth={1.5} /><span className="w-20 rotate-12 border-t-2 border-dashed border-primary/25" /><Route className="h-20 w-20 translate-y-3" strokeWidth={1.5} /></div>}
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-foreground/30 to-transparent" />
                <span className="absolute bottom-5 left-5 inline-flex items-center gap-2 rounded-full bg-background/95 px-3.5 py-2 text-xs font-bold text-primary shadow-sm sm:left-8"><UsersRound className="h-4 w-4" aria-hidden="true" />함께 떠나는 여행</span>
              </div>
              <div className="p-5 sm:p-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{course.days.length}일 코스</span>
                  <span className="rounded-full border border-primary/15 px-2.5 py-1 text-[11px] font-medium text-primary/80">{isSample ? "화면 예시" : "화면 확인용"}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{canEdit ? <Pencil className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}{canEdit ? "함께 편집" : "보기 전용"}</span>
                </div>
                <h1 id="invitation-course-title" className="mt-4 break-words text-2xl font-bold tracking-tight sm:text-3xl">{course.title}</h1>
                {course.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{course.description}</p>}
                {course.startDate && course.endDate && <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />{course.startDate.replace(/-/g, ".")} ~ {course.endDate.replace(/-/g, ".")}</p>}

                <div className="mt-6 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{canEdit ? "함께 여행 계획을 완성해요" : "여행 일정을 편하게 확인해요"}</p>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{canEdit ? "함께 편집할 여행 일정을 미리 살펴보세요." : "방문할 장소와 여행 동선을 살펴보세요."}</p>
                  {confirmed && <p role="status" className="mt-4 rounded-xl bg-background p-3 text-sm leading-6 text-primary">초대 화면을 확인했어요. 실제 참여는 서버 연동 후 적용돼요.</p>}
                  <button type="button" onClick={() => setConfirmed(true)} disabled={confirmed} aria-describedby="invitation-preview-note" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-70">{canEdit ? "초대 수락하고 함께 편집하기" : "초대 수락하고 내 코스에 추가"}{confirmed ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}</button>
                  <p id="invitation-preview-note" className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">실제 초대나 권한 변경은 적용되지 않아요.</p>
                </div>
              </div>
            </section>

            <section aria-labelledby="invitation-itinerary-title">
              <div className="mb-4 flex items-center gap-2"><Route className="h-5 w-5 text-primary" aria-hidden="true" /><h2 id="invitation-itinerary-title" className="text-lg font-bold">함께할 여행 일정</h2></div>
              <div className="space-y-4">
                {[...course.days].sort((first, second) => first.dayNumber - second.dayNumber).map((day) => (
                  <article key={day.dayNumber} className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6">
                    <h3 className="inline-flex items-center gap-2.5 text-sm font-bold"><span className="rounded-lg bg-primary/10 px-3 py-1.5 text-primary">Day {day.dayNumber}</span><span className="text-xs font-medium text-muted-foreground">{day.spots.length}개의 장소</span></h3>
                    {day.spots.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">아직 추가된 장소가 없어요.</p> : <ol aria-label={`Day ${day.dayNumber} 여행 일정`} className="mt-5 space-y-5">{[...day.spots].sort((first, second) => first.sequence - second.sequence).map((spot, index) => <li key={`${spot.spotId}-${spot.sequence}`} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{index + 1}</span><div className="min-w-0"><p className="break-words text-sm font-semibold leading-7">{spot.title}</p>{spot.address && <p className="mt-0.5 break-words text-xs leading-5 text-muted-foreground">{spot.address}</p>}{spot.memo && <p className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-muted/60 px-3 py-2 text-xs leading-6 text-muted-foreground">{spot.memo}</p>}</div></li>)}</ol>}
                  </article>
                ))}
              </div>
            </section>
          </div>

      </main>
    </div>
  );
}
