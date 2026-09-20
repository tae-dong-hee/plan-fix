import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarClock, Eye, Link2Off, Loader2, Pencil, Users } from "lucide-react";

import InviteTripArtwork from "@/components/ui/invite-trip-artwork";
import {
  acceptCourseInvite,
  CourseInviteError,
  fetchCourseInvite,
  type CourseInvitePreview,
} from "@/services/course-invites";

const inviteDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Seoul",
});

function inviteFailure(error: unknown) {
  if (error instanceof CourseInviteError && error.status === 403) {
    return { title: "새 초대가 필요해요", description: "이 초대로 다시 참여할 수 없습니다. 코스 작성자에게 새 초대 링크를 요청해 주세요.", retryable: false };
  }
  if (error instanceof CourseInviteError && error.status === 400) {
    return { title: "초대 기간이 지났어요", description: "초대한 친구에게 새 초대 링크를 요청해 주세요.", retryable: false };
  }
  if (error instanceof CourseInviteError && error.status === 404) {
    return { title: "사용할 수 없는 초대예요", description: "초대가 취소되었거나 코스가 삭제되었을 수 있어요. 초대한 친구에게 새 링크를 요청해 주세요.", retryable: false };
  }
  return { title: "초대 정보를 불러오지 못했어요", description: "잠시 후 다시 시도해 주세요.", retryable: true };
}

export default function CourseInvitePage() {
  const { token = "" } = useParams<{ token: string }>();
  // 다른 초대 링크로 이동하면 이전 요청과 화면 상태를 함께 정리한다.
  return <CourseInvitation key={token} token={token} />;
}

function CourseInvitation({ token }: { token: string }) {
  const navigate = useNavigate();
  const [invite, setInvite] = useState<CourseInvitePreview | null>(null);
  const [failure, setFailure] = useState<ReturnType<typeof inviteFailure> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useRef(false);
  const accepting = useRef(false);
  const returnTo = `/course-invites/${token}`;
  const authQuery = new URLSearchParams({ returnTo }).toString();

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    setInvite(null);
    setFailure(null);
    setNotice(null);

    if (!/^[A-Za-z0-9_-]+$/.test(token)) {
      setFailure(inviteFailure(new CourseInviteError(404, "잘못된 초대 링크입니다.")));
    } else {
      fetchCourseInvite(token, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setInvite(result); })
        .catch((error: unknown) => { if (!controller.signal.aborted) setFailure(inviteFailure(error)); });
    }

    return () => {
      active.current = false;
      controller.abort();
    };
  }, [token, attempt]);

  const handleAccept = async () => {
    if (!invite || accepting.current) return;
    accepting.current = true;
    setSubmitting(true);
    setNotice(null);

    try {
      const result = await acceptCourseInvite(token);
      if (active.current) navigate(`/courses/${result.courseId}`, { replace: true });
    } catch (error) {
      if (!active.current) return;
      if (error instanceof CourseInviteError && error.status === 401) {
        navigate(`/login?${authQuery}`);
      } else if (error instanceof CourseInviteError && ([400, 403, 404].includes(error.status))) {
        setFailure(inviteFailure(error));
      } else {
        setNotice(error instanceof CourseInviteError && error.status === 403
          ? "이 초대를 수락할 권한이 없어요. 초대한 친구에게 확인해 주세요."
          : "초대를 수락하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      accepting.current = false;
      if (active.current) setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gradient-to-b from-primary/5 via-background to-background text-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5 sm:px-8 sm:py-6">
        <Link to="/main" aria-label="PlanFix 홈" className="flex items-center gap-2 text-base font-bold tracking-tight">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg bg-background object-cover" />
          <span>Plan<span className="text-primary">Fix</span></span>
        </Link>
        <Link to="/main" className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> 홈으로
        </Link>
      </header>

      <main className="app-page-content mx-auto max-w-lg px-4 pb-12 sm:px-5 sm:pb-16">
        <section className="overflow-hidden rounded-[28px] border border-primary/10 bg-background shadow-[0_20px_60px_-30px_hsl(var(--primary)/0.2)]" aria-label="여행 코스 초대">
          {failure ? (
            <div className="px-6 pb-8 pt-10 text-center sm:px-8 sm:pb-9 sm:pt-12">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[24px] border border-primary/10 bg-primary/5">
                <Link2Off className="h-8 w-8 text-primary/70" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <div role="alert">
                <h1 className="mt-7 break-keep text-[22px] font-bold leading-snug tracking-tight sm:text-2xl">{failure.title}</h1>
                <p className="mx-auto mt-3 max-w-xs break-keep text-sm leading-6 text-muted-foreground">{failure.description}</p>
              </div>
              {failure.retryable && (
                <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-8 min-h-[52px] w-full rounded-2xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                  다시 시도
                </button>
              )}
              <Link to="/main" className="mt-6 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">홈으로 돌아가기</Link>
            </div>
          ) : !invite ? (
            <div role="status" className="flex min-h-[400px] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-primary/10 bg-primary/5">
                <Loader2 className="h-8 w-8 animate-spin text-primary/70" strokeWidth={1.5} aria-hidden="true" />
              </div>
              <p className="mt-6 break-keep text-sm leading-6 text-muted-foreground">초대 정보를 불러오는 중이에요.</p>
            </div>
          ) : (
            <>
              <div className="border-b border-primary/10 bg-primary/5 px-6 pb-4 pt-6 text-center sm:px-8 sm:pt-7">
                <p className="inline-flex items-center gap-1.5 rounded-full border border-primary/10 bg-background/70 px-3 py-1.5 text-xs font-semibold text-primary">
                  <Users className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
                  함께 떠나는 여행
                </p>
                <div className="mx-auto mt-3 w-full max-w-[224px]">
                  <InviteTripArtwork />
                </div>
              </div>

              <div className="px-5 pb-6 pt-6 sm:px-8 sm:pb-7 sm:pt-7">
                <h1 className="break-keep text-center text-2xl font-bold leading-[1.35] tracking-tight [overflow-wrap:anywhere] sm:text-[28px]">{invite.courseTitle}</h1>
                <p className="mt-3 break-keep text-center text-sm leading-6 text-muted-foreground">친구가 여행 코스에 초대했어요.<br />참여 권한을 확인하고 여행에 함께해 보세요.</p>

                <div className="mt-6 rounded-2xl border border-primary/10 bg-primary/5 p-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background text-primary shadow-sm">
                      {invite.memberRole === "EDITOR" ? <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" /> : <Eye className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />}
                    </span>
                    <h2 className="break-keep text-sm font-semibold">{invite.memberRole === "EDITOR" ? "편집 권한 초대" : "읽기 권한 초대"}</h2>
                  </div>
                  <p className="mt-2.5 break-keep text-[13px] leading-[1.7] text-muted-foreground">{invite.memberRole === "EDITOR" ? "여행 일정을 확인하고 장소와 메모를 함께 수정할 수 있어요." : "공유된 여행 일정과 장소, 메모를 확인할 수 있어요."}</p>
                  <p className="mt-3 border-t border-primary/10 pt-3 text-xs leading-5 text-muted-foreground">권한은 하나만 적용돼요. 새로 만든 초대를 수락하면 해당 권한으로 바뀌어요. 더 최신 초대를 수락했거나 작성자가 이후 권한을 변경했다면 현재 권한이 유지돼요.</p>
                </div>
                <div className="mt-4 flex items-start gap-2.5 px-0.5 text-muted-foreground">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} aria-hidden="true" />
                  <div className="min-w-0 text-xs leading-5">
                    <p className="font-medium text-foreground/70">초대 유효 기간</p>
                    <p className="mt-0.5 break-keep"><time dateTime={invite.expiresAt}>{inviteDateFormatter.format(new Date(invite.expiresAt))}</time>까지 수락할 수 있어요. (한국 시간)</p>
                  </div>
                </div>

                {notice && <p role="alert" className="mt-5 break-keep rounded-xl border border-destructive/10 bg-destructive/5 p-3 text-sm leading-6 text-destructive">{notice}</p>}
                <button type="button" onClick={() => void handleAccept()} disabled={submitting} className="mt-6 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/15 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {submitting ? "참여하는 중..." : "초대 수락하고 참여하기"}
                  {!submitting && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </button>
                <p className="mx-auto mt-3 max-w-[290px] break-keep text-center text-[11px] leading-[1.7] text-muted-foreground">로그인이 필요한 경우, 로그인 후 이 초대 화면으로 돌아와요.</p>
              </div>
              <div className="border-t border-primary/10 bg-muted/20 px-5 py-4 text-center sm:px-8">
                <p className="text-xs text-muted-foreground">
                  처음 오셨나요? <Link to={`/signup?${authQuery}`} className="ml-1 rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">회원가입</Link>
                </p>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
