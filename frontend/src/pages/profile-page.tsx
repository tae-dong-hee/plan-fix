import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Camera, ChevronRight, Loader2, UserRound } from "lucide-react";
import AppNav from "@/components/ui/app-nav";
import ProfileAvatar from "@/components/ui/profile-avatar";
import { fetchMyProfile, removeMyProfileImage, updateMyProfile, uploadMyProfileImage, type UserProfile } from "@/services/user";

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Feedback = { text: string; error: boolean } | null;

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState({ username: "", name: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoAction, setPhotoAction] = useState<"upload" | "remove" | null>(null);
  const [message, setMessage] = useState<Feedback>(null);
  const [photoMessage, setPhotoMessage] = useState<Feedback>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = saving || photoAction !== null;

  useEffect(() => {
    let cancelled = false;
    fetchMyProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setForm({ username: p.username, name: p.name ?? "", email: p.email ?? "" });
      })
      .catch(() => { if (!cancelled) navigate("/login", { replace: true }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [navigate]);

  const changePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busy) return;
    setPhotoMessage(null);
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoMessage({ text: "JPG, PNG, WebP 이미지만 업로드할 수 있습니다.", error: true });
      return;
    }
    if (!file.size || file.size > MAX_PHOTO_SIZE) {
      setPhotoMessage({ text: "비어 있지 않은 5MB 이하의 이미지를 선택해 주세요.", error: true });
      return;
    }
    setPhotoAction("upload");
    try {
      setProfile(await uploadMyProfileImage(file));
      setPhotoMessage({ text: "프로필 사진이 변경되었습니다.", error: false });
    } catch (error) {
      setPhotoMessage({ text: error instanceof Error ? error.message : "사진을 업로드하지 못했습니다. 다시 시도해 주세요.", error: true });
    } finally {
      setPhotoAction(null);
    }
  };

  const removePhoto = async () => {
    if (busy) return;
    setPhotoAction("remove");
    setPhotoMessage(null);
    try {
      setProfile(await removeMyProfileImage());
      setPhotoMessage({ text: "기본 프로필 이미지로 변경되었습니다.", error: false });
    } catch (error) {
      setPhotoMessage({ text: error instanceof Error ? error.message : "사진을 삭제하지 못했습니다. 다시 시도해 주세요.", error: true });
    } finally {
      setPhotoAction(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setSaving(true);
    setMessage(null);
    try {
      setProfile(await updateMyProfile({ username: form.username, name: form.name || null, email: form.email || null }));
      setMessage({ text: "프로필이 저장되었습니다.", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "저장에 실패했습니다.", error: true });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center" role="status" aria-label="프로필 불러오는 중"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-muted/20 pb-28 md:pb-16 md:pt-20">
      <AppNav />
      <main className="mx-auto max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/main">홈</Link><ChevronRight className="h-3.5 w-3.5" /><span className="font-medium text-foreground">프로필</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><UserRound /></div>
          <div><h1 className="text-2xl font-bold">내 프로필</h1><p className="text-sm text-muted-foreground">회원 정보를 확인하고 수정하세요.</p></div>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-5 rounded-2xl border bg-background p-5 shadow-sm sm:p-7">
          <section aria-labelledby="profile-photo-title" className="border-b pb-6">
            <h2 id="profile-photo-title" className="text-sm font-medium">프로필 사진</h2>
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
              <div className="relative shrink-0">
                <ProfileAvatar imageUrl={profile.profileImageUrl} color={profile.defaultAvatarColor} className="h-24 w-24 ring-4 ring-background shadow-sm" />
                {photoAction && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70" role="status" aria-label={photoAction === "upload" ? "프로필 사진 업로드 중" : "프로필 사진 삭제 중"}>
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <div className="min-w-0 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50">
                    <Camera className="h-4 w-4" aria-hidden="true" />{photoAction === "upload" ? "업로드 중..." : "사진 변경"}
                  </button>
                  {profile.profileImageUrl && (
                    <button type="button" disabled={busy} onClick={removePhoto} className="min-h-10 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50">
                      {photoAction === "remove" ? "변경 중..." : "기본 이미지로 변경"}
                    </button>
                  )}
                </div>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="프로필 사진 선택" aria-describedby="profile-photo-help" className="hidden" disabled={busy} onChange={changePhoto} />
                <p id="profile-photo-help" className="mt-2.5 text-xs leading-relaxed text-muted-foreground">JPG, PNG, WebP · 최대 5MB<br />사진은 선택하면 바로 저장됩니다.</p>
              </div>
            </div>
            {!profile.profileImageUrl && <p className="mt-4 text-xs leading-relaxed text-muted-foreground">사진이 없으면 5가지 색상 중 하나의 기본 이미지가 자동으로 지정됩니다.</p>}
            {photoMessage && <p role={photoMessage.error ? "alert" : "status"} className={`mt-3 text-sm ${photoMessage.error ? "text-destructive" : "text-primary"}`}>{photoMessage.text}</p>}
          </section>

          {([
            ["username", "닉네임", true],
            ["name", "이름", false],
            ["email", "이메일", false],
          ] as const).map(([key, label, required]) => (
            <label key={key} className="block text-sm font-medium">
              <span>{label}</span>
              <input type={key === "email" ? "email" : "text"} required={required} disabled={saving} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="mt-2 w-full rounded-lg border bg-background px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" />
            </label>
          ))}
          {message && <p role={message.error ? "alert" : "status"} className={`text-sm ${message.error ? "text-destructive" : "text-primary"}`}>{message.text}</p>}
          <div className="flex items-center justify-between">
            <Link to="/courses" className="text-sm font-medium text-primary hover:underline">내 여행 코스 보기</Link>
            <button disabled={busy} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "저장 중..." : "저장"}</button>
          </div>
        </form>
      </main>
    </div>
  );
}
