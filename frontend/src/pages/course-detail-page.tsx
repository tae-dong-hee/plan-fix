import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Eye,
  Globe,
  Heart,
  Loader2,
  Lock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import AppNav from "@/components/ui/app-nav";
import CourseRouteMap from "@/components/ui/course-route-map";
import CourseMetadata from "@/components/ui/course-metadata";
import { CourseInviteDialog, CourseInviteShareDialog } from "@/components/ui/course-invite-dialog";
import {
  CourseResponse,
  cancelCourseInvite,
  createCourseInvite,
  deleteCourse,
  fetchCourse,
  fetchCourseMembers,
  fetchDayAccommodations,
  fetchPendingCourseInvites,
  removeCourseMember,
  updateCourseMemberRole,
  type CourseInviteRole,
  type CourseMember,
  type DayAccommodation,
  type PendingCourseInvite,
} from "@/services/course";
import { UnauthorizedError } from "@/services/spots";
import { formatCourseDuration } from "@/lib/course-duration";

type InviteToast =
  | { kind: "success"; message: string; inviteUrl: string; memberRole: CourseInviteRole; copied: boolean }
  | { kind: "error"; title: string; message: string };

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [course, setCourse] = useState<CourseResponse | null>(null);
  const [dayAccommodations, setDayAccommodations] = useState<DayAccommodation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const inviteCreationInFlight = useRef(false);
  const [copyingInvite, setCopyingInvite] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<CourseInviteRole>("EDITOR");
  const [inviteToast, setInviteToast] = useState<InviteToast | null>(null);
  const [showMembersTable, setShowMembersTable] = useState(false);
  const [members, setMembers] = useState<CourseMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberActionPending, setMemberActionPending] = useState(false);
  const memberActionInFlight = useRef(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingCourseInvite[]>([]);
  const isOwner = !loading && !error && String(course?.courseId) === courseId && course?.isOwner === true;
  const canEdit = course?.canEdit ?? isOwner;
  const courseListPath = isOwner ? "/courses" : "/courses/public";

  const handleDelete = async () => {
    if (!courseId) return;
    if (!window.confirm("정말 이 여행 코스를 삭제하시겠습니까?")) {
      return;
    }

    setDeleting(true);
    try {
      await deleteCourse(courseId);
      navigate("/courses", { replace: true });
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
        navigate("/login");
        return;
      }
      alert(err instanceof Error ? err.message : "코스 삭제에 실패했습니다.");
      setDeleting(false);
    }
  };

  const copyInviteLink = async (inviteUrl: string) => {
    setCopyingInvite(true);
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        copied = true;
      }
    } catch {
      // 링크 생성은 성공했다. 복사 권한이 없어도 생성된 링크를 계속 사용할 수 있다.
    } finally {
      setCopyingInvite(false);
      setInviteToast((current) => current?.kind === "success" && current.inviteUrl === inviteUrl
        ? { ...current, copied, message: copied ? "초대 링크를 복사했습니다. 친구에게 보내 주세요." : "초대 링크는 만들어졌지만 자동 복사를 하지 못했습니다. 아래 링크를 직접 복사해 주세요." }
        : current);
    }
  };

  const handleInvite = async () => {
    if (!courseId || !isOwner || course?.visibility !== "PUBLIC" || inviteCreationInFlight.current) return;
    inviteCreationInFlight.current = true;
    setCreatingInvite(true);
    setInviteToast(null);
    try {
      const invite = await createCourseInvite(courseId, inviteRole);
      setInviteDialogOpen(false);
      setInviteToast({
        kind: "success",
        message: `${inviteRole === "EDITOR" ? "편집" : "읽기"} 권한 초대 링크를 만들었습니다.`,
        inviteUrl: invite.inviteUrl,
        memberRole: invite.memberRole,
        copied: false,
      });
      await copyInviteLink(invite.inviteUrl);
    } catch (err) {
      if (err instanceof UnauthorizedError) { navigate("/login"); return; }
      setInviteToast({ kind: "error", title: "초대 링크 생성 실패", message: err instanceof Error ? err.message : "초대 링크를 만들지 못했습니다." });
    } finally {
      inviteCreationInFlight.current = false;
      setCreatingInvite(false);
    }
  };

  const openMembers = async () => {
    if (!courseId || !isOwner || course?.visibility !== "PUBLIC" || membersLoading) return;
    setInviteDialogOpen(false);
    setShowMembersTable(true); setMembersLoading(true); setMemberError(null);
    try {
      const [memberResult, pendingResult] = await Promise.all([fetchCourseMembers(courseId), fetchPendingCourseInvites(courseId)]);
      setMembers(memberResult); setPendingInvites(pendingResult);
    } catch (err) { setMemberError(err instanceof Error ? err.message : "멤버 목록을 불러오지 못했습니다."); }
    finally { setMembersLoading(false); }
  };

  const manageMember = async (action: () => Promise<void>) => {
    if (!isOwner || memberActionInFlight.current) return;
    memberActionInFlight.current = true;
    setMemberActionPending(true);
    setMemberError(null);
    try { await action(); }
    catch (error) { setMemberError(error instanceof Error ? error.message : "변경 내용을 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { memberActionInFlight.current = false; setMemberActionPending(false); }
  };

  useEffect(() => {
    if (!courseId) return;

    let ignore = false;
    setLoading(true);
    setError(null);

    let latestRequest = 0;
    const loadCourse = async () => {
      const request = ++latestRequest;
      const isCurrent = () => !ignore && request === latestRequest;
      try {
        const res = await fetchCourse(courseId);
        if (isCurrent()) {
          setCourse(res);
          setError(null);
          setDayAccommodations([]);
          if (res && (res.canViewAccommodations ?? res.isOwner === true)) {
            void fetchDayAccommodations(courseId)
              .then((values) => {
                if (isCurrent()) setDayAccommodations(values);
              })
              .catch(() => undefined);
          }
        }
      } catch (err) {
        if (!isCurrent()) return;
        if (err instanceof UnauthorizedError) {
          alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
          navigate("/login");
          return;
        }
        if (isCurrent()) {
          setCourse(null);
          setDayAccommodations([]);
          setMembers([]);
          setPendingInvites([]);
          setInviteToast(null);
          setInviteDialogOpen(false);
          setShowMembersTable(false);
          setError(err instanceof Error ? err.message : "코스를 불러오지 못했습니다.");
        }
      } finally {
        if (isCurrent()) {
          setLoading(false);
        }
      }
    };

    void loadCourse();
    const revalidate = () => { if (document.visibilityState === "visible") void loadCourse(); };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      ignore = true;
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [courseId, navigate]);

  useEffect(() => {
    if (!courseId || course?.visibility !== "PUBLIC" || !isOwner) return;
    fetchCourseMembers(courseId).then(setMembers).catch(() => undefined);
  }, [courseId, isOwner, course?.visibility]);

  return (
    <div className="min-h-screen bg-muted/20 pb-28 md:pb-16">
      <AppNav courseIsOwner={isOwner} />

      <main className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 sm:pt-8 md:pt-24">
        {/* 상단 브레드크럼 */}
        <nav aria-label="현재 위치" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to={courseListPath} className="hover:text-foreground">
            {isOwner ? "내 여행 코스" : "공개 여행 코스"}
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span aria-current="page" className="font-medium text-foreground">코스 상세</span>
        </nav>

        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">여행 코스를 불러오는 중입니다...</p>
          </div>
        ) : error ? (
          <div className="mt-8 rounded-2xl border border-destructive/30 bg-card p-8 text-center shadow-sm">
            <p className="text-base font-semibold text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              다시 시도
            </button>
          </div>
        ) : !course ? (
          <div className="mt-8 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
            <MapPin className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <h2 className="mt-4 text-lg font-bold text-foreground">
              존재하지 않거나 삭제된 코스입니다.
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              요청하신 코스 정보를 찾을 수 없습니다.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                to={courseListPath}
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                코스 목록으로
              </Link>
              <Link
                to="/courses/create"
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                새 코스 만들기
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {/* 코스 헤더 카드 */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    {formatCourseDuration(course.days.length)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      course.visibility === "PUBLIC"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {course.visibility === "PUBLIC" ? (
                      <>
                        <Globe className="h-3 w-3" />
                        <span>전체 공개</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-3 w-3" />
                        <span>나만 보기</span>
                      </>
                    )}
                  </span>
                </div>

                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    {isOwner && course.visibility === "PUBLIC" && (
                      <>
                        <button type="button" onClick={() => { setInviteToast(null); setInviteDialogOpen(true); }} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90">
                          <UserPlus className="h-3.5 w-3.5" /> <span>친구 초대</span>
                        </button>
                        <button type="button" onClick={() => void openMembers()} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"><Users className="h-3.5 w-3.5" />멤버 관리</button>
                      </>
                    )}
                    <Link
                      to={`/courses/${course.courseId}/edit`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>코스 수정</span>
                    </Link>
                    {isOwner && <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-background px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{deleting ? "삭제 중..." : "코스 삭제"}</span>
                    </button>}
                  </div>
                )}
              </div>

              {course.visibility === "PRIVATE" && (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  작성자만 볼 수 있는 코스예요. 친구를 초대하려면 코스 수정에서 전체 공개로 변경해 주세요.
                </p>
              )}

              <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {course.title}
              </h1>
              <CourseMetadata generatedBy={course.generatedBy} themes={course.themes} className="mt-3" />

              {course.description && (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {course.description}
                </p>
              )}

              {isOwner && course.visibility === "PUBLIC" && <div className="mt-5 flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3"><div className="flex min-w-0 items-center gap-2"><Users className="h-4 w-4 shrink-0 text-primary" /><span className="text-sm font-semibold">참여 멤버</span><div className="flex -space-x-2">{members.filter((member) => member.role !== "OWNER").slice(0, 4).map((member) => <span key={member.userId} title={member.username} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary/15 text-[10px] font-bold text-primary">{(member.username || "?").slice(0, 1)}</span>)}{members.filter((member) => member.role !== "OWNER").length > 4 && <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-bold">+{members.filter((member) => member.role !== "OWNER").length - 4}</span>}</div><span className="text-xs text-muted-foreground">{members.filter((member) => member.role !== "OWNER").length}명</span></div><button type="button" onClick={() => void openMembers()} className="shrink-0 text-xs font-semibold text-primary hover:underline">전체 보기</button></div>}

              <div className="mt-6 flex flex-wrap items-center gap-y-2 gap-x-6 border-t border-border pt-4 text-xs text-muted-foreground">
                {course.startDate && course.endDate && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>
                      {course.startDate} ~ {course.endDate} ({formatCourseDuration(course.days.length)})
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span>
                    총{" "}
                    <strong className="text-foreground">
                      {course.days.reduce((sum, d) => sum + d.spots.length, 0)}
                    </strong>
                    개 장소
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {course.viewCount}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" />
                    {course.likeCount}
                  </span>
                </div>
              </div>
            </div>

            <CourseRouteMap key={course.courseId} days={course.days} startDate={course.startDate} accommodations={dayAccommodations} />

            {/* 하단 액션 버튼 */}
            <div className="flex justify-end gap-3 pt-4">
              <Link
                to={courseListPath}
                className="rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                코스 목록
              </Link>
              <Link
                to="/courses/create"
                className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow"
              >
                <Plus className="h-4 w-4" />
                새 코스 만들기
              </Link>
            </div>
          </div>
        )}
      </main>
      {inviteToast?.kind === "success" && (
        <CourseInviteShareDialog
          inviteUrl={inviteToast.inviteUrl}
          courseTitle={course?.title ?? "여행 코스"}
          memberRole={inviteToast.memberRole}
          message={inviteToast.message}
          copied={inviteToast.copied}
          copying={copyingInvite}
          onCopy={() => void copyInviteLink(inviteToast.inviteUrl)}
          onClose={() => setInviteToast(null)}
        />
      )}
      {inviteToast?.kind === "error" && !inviteDialogOpen && (
        <div role="alert" className="fixed inset-x-4 top-20 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-destructive/15 bg-background p-4 shadow-panel">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{inviteToast.title}</p><p className="mt-1 break-keep text-xs leading-5 text-muted-foreground">{inviteToast.message}</p></div>
          <button type="button" onClick={() => setInviteToast(null)} aria-label="알림 닫기" className="rounded-full p-1 text-muted-foreground transition hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      )}
      {showMembersTable && <div className="fixed inset-0 z-[55] flex items-center justify-center bg-foreground/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowMembersTable(false); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="members-title" className="max-h-[calc(100dvh-32px)] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-2xl">
          <div className="flex items-center justify-between"><h2 id="members-title" className="text-lg font-bold">멤버 및 초대 관리</h2><button type="button" onClick={() => setShowMembersTable(false)} aria-label="닫기"><X className="h-5 w-5" /></button></div>
          {memberError && <p role="alert" className="mt-4 rounded-xl bg-destructive/5 p-3 text-sm text-destructive">{memberError}</p>}
          {membersLoading ? <div role="status" aria-label="멤버 불러오는 중" className="flex h-24 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : <>
            <h3 className="mt-5 text-sm font-semibold">참여 중인 멤버</h3>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-3">이름</th><th className="px-4 py-3">닉네임</th><th className="px-4 py-3">권한</th><th className="px-4 py-3">관리</th></tr></thead>
                <tbody className="divide-y divide-border">{members.filter((member) => member.role !== "OWNER").map((member) => <tr key={member.userId}>
                  <td className="px-4 py-3">{member.name || "-"}</td><td className="px-4 py-3">{member.username || "-"}</td>
                  <td className="px-4 py-3"><select aria-label={`${member.username || member.name || "멤버"} 참여 권한`} value={member.role} disabled={memberActionPending} onChange={(event) => {
                    const role = event.currentTarget.value as CourseInviteRole;
                    void manageMember(async () => { await updateCourseMemberRole(courseId!, member.userId, role); setMembers((list) => list.map((item) => item.userId === member.userId ? { ...item, role } : item)); });
                  }} className="rounded-lg border border-border bg-background px-2 py-1 text-xs"><option value="VIEWER">읽기 권한</option><option value="EDITOR">편집 권한</option></select></td>
                  <td className="px-4 py-3"><button type="button" disabled={memberActionPending} onClick={() => void manageMember(async () => { await removeCourseMember(courseId!, member.userId); setMembers((list) => list.filter((item) => item.userId !== member.userId)); })} className="text-destructive disabled:opacity-50" aria-label={`${member.username || member.name || "멤버"} 멤버 삭제`}><Trash2 className="h-4 w-4" /></button></td>
                </tr>)}</tbody>
              </table>
              {members.filter((member) => member.role !== "OWNER").length === 0 && <p className="p-5 text-center text-sm text-muted-foreground">참여 중인 멤버가 없습니다.</p>}
            </div>
            <h3 className="mt-6 text-sm font-semibold">사용 가능한 초대 링크</h3>
            <div className="mt-3 space-y-2">{pendingInvites.length ? pendingInvites.map((invite) => <div key={invite.token} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span>{invite.role === "EDITOR" ? "편집 권한" : "읽기 권한"}</span>
              <button type="button" disabled={memberActionPending} onClick={() => void manageMember(async () => { await cancelCourseInvite(courseId!, invite.token); setPendingInvites((list) => list.filter((item) => item.token !== invite.token)); })} className="text-xs font-semibold text-destructive disabled:opacity-50">초대 취소</button>
            </div>) : <p className="text-sm text-muted-foreground">사용 가능한 초대 링크가 없습니다.</p>}</div>
          </>}
        </section>
      </div>}
      {inviteDialogOpen && (
        <CourseInviteDialog
          title={course?.title}
          role={inviteRole}
          onRoleChange={setInviteRole}
          creating={creatingInvite}
          error={inviteToast?.kind === "error" ? inviteToast : null}
          onCreate={() => void handleInvite()}
          onClose={() => setInviteDialogOpen(false)}
          onDismissError={() => setInviteToast(null)}
        />
      )}
    </div>
  );
}
