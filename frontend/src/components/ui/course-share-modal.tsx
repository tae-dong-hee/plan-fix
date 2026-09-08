import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Copy, Eye, Link2, MapPin, Pencil, Route, Share2, Users, X } from "lucide-react";
import type { CourseResponse } from "@/services/course";
import type { CoursePermission } from "@/services/course-sharing";

const focusStyle = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const permissionName = (permission: CoursePermission) => permission === "EDITOR" ? "함께 편집" : "보기만";

function appBaseUrl() {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (["https:", "http:"].includes(url.protocol)) return `${url.origin}${url.pathname}`.replace(/\/$/, "");
    } catch { /* Fall back to the current site if the public address is invalid. */ }
  }
  return window.location.origin;
}

export default function CourseShareModal({ course, onClose }: { course: CourseResponse; onClose: () => void }) {
  const [permission, setPermission] = useState<CoursePermission>("VIEWER");
  const [message, setMessage] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const titleId = useId();
  const radioName = useId();
  const base = appBaseUrl();
  const localAddress = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(new URL(base).hostname);
  const places = course.days.flatMap((day) => day.spots);
  const thumbnail = course.thumbnail || places.find((spot) => spot.thumbnail)?.thumbnail;
  const link = `${base}/courses/${course.courseId}`;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      const selectedRadio = dialog?.querySelector('input[type="radio"]:checked');
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]') || [])
        .filter((element) => !(element instanceof HTMLInputElement && element.type === "radio") || element === selectedRadio);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(link);
      setMessage("코스 링크를 복사했어요.");
    } catch {
      linkRef.current?.focus(); linkRef.current?.select();
      setMessage("아래 주소를 길게 누르거나 Ctrl+C로 복사해 주세요.");
    }
  }

  async function shareLink() {
    if (!navigator.share) return;
    try { await navigator.share({ title: course.title, text: `${course.title} 코스를 확인해 보세요.`, url: link }); }
    catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) setMessage("공유 창을 열지 못했어요. 링크 복사를 이용해 주세요.");
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-border bg-background shadow-panel sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/70 px-5 py-5 sm:px-7">
          <div><span className="text-[11px] font-bold tracking-widest text-primary">TRAVEL TOGETHER</span><h2 id={titleId} className="mt-1 text-2xl font-extrabold text-foreground">친구 초대</h2><p className="mt-2 text-sm text-muted-foreground">좋은 여행은 함께할 때 더 즐거우니까.</p></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="친구 초대 닫기" className={`rounded-full p-2 text-muted-foreground hover:bg-muted ${focusStyle}`}><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-6 overflow-y-auto overscroll-contain px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-7">
          <div className="flex overflow-hidden rounded-2xl border border-primary/15 bg-primary/5">
            <div className="flex w-24 shrink-0 items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 text-primary sm:w-28">{thumbnail && !imageFailed ? <img src={thumbnail} alt="" onError={() => setImageFailed(true)} className="h-full min-h-28 w-full object-cover" /> : <Route className="h-8 w-8" />}</div>
            <div className="min-w-0 py-4 pl-4 pr-3"><p className="text-[11px] font-bold text-primary">함께 떠날 코스</p><h3 className="mt-1 break-words font-bold text-foreground">{course.title}</h3><p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{course.days.length}일 · 장소 {places.length}곳</p></div>
          </div>

          <fieldset><legend className="mb-3 text-sm font-bold text-foreground">친구에게 어떤 권한을 줄까요?</legend><div className="grid grid-cols-2 gap-3">
            {(["VIEWER", "EDITOR"] as const).map((option) => {
              const Icon = option === "EDITOR" ? Pencil : Eye;
              return <label key={option} className="cursor-pointer">
                <input type="radio" name={radioName} value={option} checked={permission === option} onChange={() => setPermission(option)} aria-label={permissionName(option)} className="peer sr-only" />
                <div className={`h-full rounded-2xl border-2 p-3 transition peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 sm:p-4 ${permission === option ? "border-primary bg-primary/5" : "border-border/70"}`}>
                  <div className="mb-3 flex items-center justify-between"><span className="rounded-xl bg-primary/10 p-2 text-primary"><Icon className="h-5 w-5" /></span>{permission === option && <CheckCircle2 className="h-5 w-5 text-primary" />}</div>
                  <p className="text-sm font-bold text-foreground">{permissionName(option)}</p><p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{option === "EDITOR" ? "장소 추가, 순서 변경, 메모를 함께 작성해요." : "코스와 일정을 확인할 수 있어요."}</p>
                </div>
              </label>;
            })}
          </div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">초대와 권한 변경은 서버 연동 후 적용돼요.</p></fieldset>

          <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-primary"><Link2 className="h-4 w-4" />코스 공유 링크</div>
            <label className="block"><span className="sr-only">공유 링크</span><input ref={linkRef} readOnly value={link} onFocus={(event) => event.currentTarget.select()} className={`w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground ${focusStyle}`} /></label>
            <div className="flex gap-2">
              <button type="button" onClick={() => void copyLink()} className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground ${focusStyle}`}><Copy className="h-4 w-4" />링크 복사</button>
              {typeof navigator.share === "function" && <button type="button" onClick={() => void shareLink()} className={`flex items-center gap-2 rounded-xl border border-primary/20 bg-background px-4 py-3 text-sm font-bold text-primary ${focusStyle}`}><Share2 className="h-4 w-4" />공유</button>}
            </div>
            {course.visibility === "PRIVATE" && <p className="text-xs leading-relaxed text-muted-foreground">비공개 코스는 현재 작성자만 볼 수 있어요.</p>}
            {localAddress && <p className="text-xs leading-relaxed text-muted-foreground">이 주소는 현재 컴퓨터에서만 열 수 있어요. 친구에게 보내려면 공개된 사이트 주소가 필요해요.</p>}
          </div>

          <Link to="/invite?preview=1" state={{ previewCourse: course, previewPermission: permission }} onClick={onClose} className={`flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-background px-4 py-3 text-sm font-bold text-primary transition hover:bg-primary/5 ${focusStyle}`}>초대 화면 보기<ArrowUpRight className="h-4 w-4" /></Link>
          {message && <p role="status" className="rounded-xl bg-primary/10 p-3 text-sm leading-relaxed text-primary">{message}</p>}

          <section className="border-t border-border/70 pt-5" aria-label="함께하는 친구">
            <h3 className="flex items-center gap-2 text-sm font-bold text-foreground"><Users className="h-4 w-4 text-primary" />함께하는 친구</h3>
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/50 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/30 text-primary/60"><Users className="h-5 w-5" /></span><p className="text-xs leading-relaxed text-muted-foreground">함께 여행할 친구를 초대해 보세요.</p></div>
          </section>
        </div>
      </div>
    </div>, document.body,
  );
}
