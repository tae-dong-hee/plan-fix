import { useEffect, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import PasswordRecoveryLayout, { recoveryButtonClassName, recoveryInputClassName } from "@/components/ui/password-recovery-layout";
import { LoaderOne } from "@/components/ui/unique-loader-components";
import PhoneVerification from "@/components/ui/phone-verification";
import { authPathWithReturnTo, getInviteReturnTo } from "@/lib/auth-return-to";
import { requestPasswordReset, passwordResetUnavailableMessage } from "@/services/password-reset";

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = getInviteReturnTo(searchParams.get("returnTo"));
  const loginPath = authPathWithReturnTo("/login", returnTo);
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [loginId, setLoginId] = useState(() => /^[a-z0-9]{6,20}$/.test(searchParams.get("loginId")?.trim() ?? "") ? searchParams.get("loginId")!.trim() : "");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<{ loginId?: string; email?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!retryAt) return;
    const updateCooldown = () => setCooldown(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    updateCooldown();
    const timer = window.setInterval(updateCooldown, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || Date.now() < retryAt) return;
    const nextErrors: typeof errors = {};
    if (!loginId.trim()) nextErrors.loginId = "아이디를 입력해 주세요.";
    else if (!/^[a-z0-9]{6,20}$/.test(loginId.trim())) nextErrors.loginId = "영문 소문자와 숫자로 6~20자로 입력해 주세요.";
    if (!email.trim()) nextErrors.email = "가입할 때 등록한 이메일을 입력해 주세요.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) nextErrors.email = "올바른 이메일 주소를 입력해 주세요.";
    setErrors(nextErrors);
    setError(null);
    setSubmitted(false);
    if (Object.keys(nextErrors).length) return;
    setIsSubmitting(true);
    try {
      await requestPasswordReset({ loginId: loginId.trim(), email: email.trim() });
      setSubmitted(true);
      setRetryAt(Date.now() + 60_000);
      setCooldown(60);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : passwordResetUnavailableMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PasswordRecoveryLayout title="비밀번호 찾기" description="가입한 이메일 또는 인증한 휴대폰번호로 비밀번호를 새로 설정하세요." loginPath={loginPath}>
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="group" aria-label="비밀번호 찾기 방법">
        {(["email", "phone"] as const).map((value) => <button key={value} type="button" disabled={isSubmitting} aria-pressed={method === value} onClick={() => { setMethod(value); setError(null); setErrors({}); setSubmitted(false); }} className={`min-h-11 rounded-lg px-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${method === value ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}>{value === "email" ? "이메일로 찾기" : "휴대폰으로 찾기"}</button>)}
      </div>
      {submitted && <div role="status" className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
        <MailCheck aria-hidden="true" className="mb-2 h-6 w-6 text-primary" />
        <p className="font-medium">메일함을 확인해 주세요</p>
        <p className="mt-1 text-muted-foreground">비밀번호 재설정 메일을 발송했습니다. 메일의 링크를 열어 새 비밀번호를 설정해 주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요.</p>
      </div>}
      <form onSubmit={method === "email" ? handleSubmit : (event) => event.preventDefault()} noValidate aria-label={method === "email" ? "비밀번호 재설정 메일 요청" : "휴대폰으로 비밀번호 찾기"} aria-busy={isSubmitting} className="space-y-5">
        <div>
          <label htmlFor="recovery-login-id" className="text-sm font-medium">아이디</label>
          <input id="recovery-login-id" name="loginId" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={20} placeholder="가입한 아이디" value={loginId}
            onChange={(event) => { setLoginId(event.target.value); setSubmitted(false); setError(null); setErrors((current) => ({ ...current, loginId: undefined })); }}
            disabled={isSubmitting} className={recoveryInputClassName} aria-invalid={Boolean(errors.loginId)} aria-describedby={errors.loginId ? "recovery-login-id-error" : undefined} />
          {errors.loginId && <p id="recovery-login-id-error" role="alert" className="mt-2 text-xs text-destructive">{errors.loginId}</p>}
        </div>
        {method === "email" ? <><div>
          <label htmlFor="recovery-email" className="text-sm font-medium">이메일</label>
          <input id="recovery-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="name@example.com" value={email}
            onChange={(event) => { setEmail(event.target.value); setSubmitted(false); setError(null); setErrors((current) => ({ ...current, email: undefined })); }}
            disabled={isSubmitting} className={recoveryInputClassName} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "recovery-email-error" : undefined} />
          {errors.email && <p id="recovery-email-error" role="alert" className="mt-2 text-xs text-destructive">{errors.email}</p>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={isSubmitting || cooldown > 0} className={recoveryButtonClassName}>
          {isSubmitting && <span aria-hidden="true"><LoaderOne variant="inverse" /></span>}
          {isSubmitting ? "요청 중..." : cooldown > 0 ? `다시 보내기 (${cooldown}초 후)` : submitted ? "재설정 메일 다시 보내기" : "재설정 메일 보내기"}
        </button>
        </> : <>
          <p className="text-xs leading-5 text-muted-foreground">가입할 때 또는 내 프로필에서 인증한 휴대폰번호를 입력해 주세요. 번호를 등록하지 않았다면 이메일로 찾아 주세요.</p>
          <PhoneVerification purpose="RESET_PASSWORD" loginId={loginId} onVerified={(result) => { if (result?.passwordResetToken) navigate(`${authPathWithReturnTo("/reset-password", returnTo)}#token=${encodeURIComponent(result.passwordResetToken)}`); }} />
        </>}
      </form>
      <Link to={authPathWithReturnTo("/find-id", returnTo)} className="mt-5 block text-center text-sm text-primary hover:underline">아이디를 모르겠어요 · 아이디 찾기</Link>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">카카오로 가입했다면 로그인 화면에서 카카오 로그인을 이용해 주세요.</p>
    </PasswordRecoveryLayout>
  );
}
