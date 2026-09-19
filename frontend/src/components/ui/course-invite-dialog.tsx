import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowRight, Check, CheckCheck, Clock3, Copy, ExternalLink, Eye, Link2, Loader2, MessageCircle, Pencil, Share2, X } from "lucide-react";

import InviteTripArtwork from "./invite-trip-artwork";
import type { CourseInviteRole } from "@/services/course";
import { prepareKakaoShare, shareCourseInvite } from "@/lib/kakao-share";

function InviteModal({ children, labelledBy, onClose }: { children: ReactNode; labelledBy: string; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 px-4 py-5 backdrop-blur-[6px] sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="relative max-h-[calc(100dvh-40px)] w-full max-w-[460px] overflow-y-auto overscroll-contain rounded-[28px] border border-primary/10 bg-background shadow-[0_24px_90px_-24px_hsl(var(--foreground)/0.35)] outline-none">
        {children}
      </section>
    </div>
  );
}

const closeButtonClass = "absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/80 text-muted-foreground transition hover:border-primary/20 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50";
const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function CourseInviteDialog({ title, role, onRoleChange, creating, error, onCreate, onClose, onDismissError }: {
  title?: string;
  role: CourseInviteRole;
  onRoleChange: (role: CourseInviteRole) => void;
  creating: boolean;
  error: { title: string; message: string } | null;
  onCreate: () => void;
  onClose: () => void;
  onDismissError: () => void;
}) {
  return (
    <InviteModal labelledBy="invite-title" onClose={onClose}>
      <button type="button" onClick={onClose} aria-label="닫기" className={closeButtonClass}><X className="h-4 w-4" aria-hidden="true" /></button>
      <div className="bg-gradient-to-b from-primary/[0.08] to-transparent px-6 pb-5 pt-7 text-center sm:px-8">
        <InviteTripArtwork compact />
        <h2 id="invite-title" className="mt-2 text-[23px] font-bold tracking-tight">친구 초대</h2>
        <p className="mt-2 break-keep text-sm leading-6 text-muted-foreground">여행의 설렘, 친구와 함께 나눠요.</p>
        {title && <p className="mx-auto mt-3 max-w-full truncate text-xs font-medium text-primary">{title}</p>}
      </div>
      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground">참여 권한</p><span className="text-[11px] text-muted-foreground/80">초대 후에도 변경할 수 있어요</span></div>
        <div className="space-y-2.5" role="group" aria-label="초대 권한 선택">
          {([
            { value: "EDITOR", label: "편집 권한", description: "일정과 메모를 함께 수정해요", Icon: Pencil },
            { value: "VIEWER", label: "읽기 권한", description: "완성된 여행 일정을 함께 봐요", Icon: Eye },
          ] as const).map(({ value, label, description, Icon }) => {
            const selected = role === value;
            return <button key={value} type="button" disabled={creating} aria-pressed={selected} onClick={() => onRoleChange(value)} className={`flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition disabled:cursor-wait ${focusClass} ${selected ? "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/10" : "border-border/80 bg-background hover:border-primary/30 hover:bg-muted/40"}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block break-keep text-xs leading-5 text-muted-foreground">{description}</span></span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${selected ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}>{selected && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}</span>
            </button>;
          })}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />초대 링크는 7일 동안 사용할 수 있어요.</p>
        {error && <div role="alert" className="relative mt-4 flex gap-2.5 rounded-xl border border-destructive/15 bg-destructive/5 p-3 pr-8"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /><div><p className="text-xs font-semibold text-destructive">{error.title}</p><p className="mt-1 break-keep text-xs leading-5 text-muted-foreground">{error.message}</p></div><button type="button" onClick={onDismissError} aria-label="알림 닫기" className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button></div>}
        <div className="mt-6 flex gap-2.5 border-t border-border/60 pt-5">
          <button type="button" onClick={onClose} className={`rounded-xl border border-border px-5 py-3 text-sm font-medium text-muted-foreground transition hover:bg-muted ${focusClass}`}>취소</button>
          <button type="button" onClick={onCreate} disabled={creating} className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.45)] transition hover:brightness-105 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 ${focusClass}`}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}{creating ? "링크 생성 중..." : "초대 링크 만들기"}{!creating && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </InviteModal>
  );
}

export function CourseInviteShareDialog({ inviteUrl, courseTitle, memberRole, message, copied, copying, onCopy, onClose }: {
  inviteUrl: string; courseTitle: string; memberRole: CourseInviteRole; message: string; copied: boolean; copying: boolean; onCopy: () => void; onClose: () => void;
}) {
  const [kakaoReady, setKakaoReady] = useState(false);
  const [kakaoError, setKakaoError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const sharingInFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setKakaoReady(false);
    setKakaoError(null);
    prepareKakaoShare().then(() => {
      if (active) setKakaoReady(true);
    }).catch((error: unknown) => {
      if (active) setKakaoError(error instanceof Error ? error.message : "카카오톡 공유를 준비하지 못했습니다. 링크를 복사해 친구에게 보내 주세요.");
    });
    return () => { active = false; };
  }, [attempt]);

  const shareToKakao = () => {
    setShareMessage(null);
    try {
      // SDK 준비는 미리 끝내고, 사용자 클릭 안에서 바로 호출해야 팝업이 차단되지 않는다.
      shareCourseInvite({ inviteUrl, courseTitle, memberRole });
      setShareMessage("카카오톡에서 친구나 채팅방을 선택해 초대를 보내 주세요.");
    } catch (error) {
      setKakaoError(error instanceof Error ? error.message : "카카오톡 공유를 열지 못했습니다. 링크를 복사해 친구에게 보내 주세요.");
    }
  };

  const shareLink = async () => {
    if (sharingInFlight.current || !navigator.share) return;
    sharingInFlight.current = true;
    setSharing(true);
    setShareMessage(null);
    try {
      await navigator.share({ title: `${courseTitle} · PlanFix 친구 초대`, text: `${memberRole === "EDITOR" ? "편집" : "읽기"} 권한으로 여행에 함께해요.`, url: inviteUrl });
    } catch (error) {
      if (!(error && typeof error === "object" && "name" in error && error.name === "AbortError")) {
        setShareMessage("링크 공유를 열지 못했습니다. 링크를 복사해 친구에게 보내 주세요.");
      }
    } finally {
      sharingInFlight.current = false;
      setSharing(false);
    }
  };

  return (
    <InviteModal labelledBy="invite-share-title" onClose={onClose}>
      <button type="button" onClick={onClose} aria-label="알림 닫기" className={closeButtonClass}><X className="h-4 w-4" aria-hidden="true" /></button>
      <div className="bg-gradient-to-b from-primary/[0.08] to-transparent px-6 pb-6 pt-10 text-center sm:px-8">
        <div className="mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-[24px] border border-primary/10 bg-primary/10 ring-8 ring-primary/[0.035]"><CheckCheck className="h-8 w-8 text-primary" strokeWidth={1.7} aria-hidden="true" /></div>
        <h2 id="invite-share-title" className="mt-7 text-[23px] font-bold tracking-tight">초대 링크 준비 완료</h2>
        <p role="status" aria-live="polite" className="mt-2 break-keep text-sm leading-6 text-muted-foreground">{message}</p>
        <p className="mt-2 text-xs font-semibold text-primary">{memberRole === "EDITOR" ? "편집 권한 · 일정과 메모를 함께 수정해요" : "읽기 권한 · 여행 일정을 함께 봐요"}</p>
      </div>
      <div className="px-6 pb-6 sm:px-8 sm:pb-8">
        <label htmlFor="created-invite-link" className="text-xs font-semibold text-muted-foreground">초대 링크</label>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-2 pl-3">
          <Link2 className="h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
          <input id="created-invite-link" readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-muted-foreground outline-none focus:text-foreground" />
          <button type="button" onClick={onCopy} disabled={copying} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/15 bg-background px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-50 ${focusClass}`}>{copying ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}{copying ? "복사 중..." : "링크 복사"}</button>
        </div>
        <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className={`mx-auto mt-3 flex w-fit items-center gap-1 text-xs font-medium text-primary/80 hover:text-primary hover:underline ${focusClass}`}>초대 링크 열기<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
        <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-border/60" /><span className="text-[11px] text-muted-foreground">친구에게 공유하기</span><div className="h-px flex-1 bg-border/60" /></div>
        <button type="button" disabled={!kakaoReady} onClick={shareToKakao} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-3.5 text-sm font-semibold text-[#191919] transition hover:bg-[#f5dc00] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6a400] focus-visible:ring-offset-2">{!kakaoReady && !kakaoError ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : <MessageCircle className="h-[18px] w-[18px] fill-current" strokeWidth={1.5} aria-hidden="true" />}카카오톡으로 초대<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
        {kakaoError && <div className="mt-3 rounded-xl bg-muted p-3"><p role="alert" className="break-keep text-xs leading-5 text-muted-foreground">{kakaoError}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className={`mt-2 text-xs font-semibold text-primary ${focusClass}`}>카카오톡 공유 다시 준비</button></div>}
        {typeof navigator.share === "function" && <button type="button" onClick={() => void shareLink()} disabled={sharing} className={`mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold transition hover:bg-muted disabled:opacity-50 ${focusClass}`}><Share2 className="h-4 w-4" aria-hidden="true" />{sharing ? "공유 중..." : "다른 앱으로 링크 공유"}</button>}
        {shareMessage && <p role="status" aria-live="polite" className="mt-3 break-keep text-center text-xs leading-5 text-muted-foreground">{shareMessage}</p>}
        <p className="mt-3 break-keep text-center text-[11px] leading-5 text-muted-foreground">{copied ? "복사한 링크로도 친구를 초대할 수 있어요." : "링크를 복사하거나 카카오톡에서 친구를 선택해 초대해 주세요."}</p>
      </div>
    </InviteModal>
  );
}
