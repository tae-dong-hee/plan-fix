import { useEffect, useRef, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import PasswordRecoveryLayout, { recoveryButtonClassName, recoveryInputClassName } from "@/components/ui/password-recovery-layout";
import { LoaderOne } from "@/components/ui/unique-loader-components";
import { authPathWithReturnTo, getInviteReturnTo } from "@/lib/auth-return-to";
import { formatRecoveryWait, recoveryWaitMessage } from "@/lib/recovery-retry";
import { IdRecoveryError, idRecoveryUnavailableMessage, requestIdRecovery } from "@/services/id-recovery";

export default function FindIdPage() {
  const [searchParams] = useSearchParams();
  const returnTo = getInviteReturnTo(searchParams.get("returnTo"));
  const loginPath = authPathWithReturnTo("/login", returnTo);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [rateLimited, setRateLimited] = useState(false);
  const requestLock = useRef(false);
  const version = useRef(0);

  useEffect(() => () => { version.current += 1; }, []);
  useEffect(() => {
    if (!retryAt) return;
    const update = () => setCooldown(Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestLock.current || Date.now() < retryAt) return;
    const trimmedEmail = email.trim();
    const validationError = !trimmedEmail ? "가입할 때 등록한 이메일을 입력해 주세요." : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) ? "올바른 이메일 주소를 입력해 주세요." : null;
    setEmailError(validationError);
    setError(null);
    setRateLimited(false);
    setSubmitted(false);
    if (validationError) return;
    requestLock.current = true;
    setIsSubmitting(true);
    const currentVersion = version.current;
    try {
      await requestIdRecovery({ email: trimmedEmail });
      if (currentVersion !== version.current) return;
      setSubmitted(true);
      setRetryAt(Date.now() + 60_000);
      setCooldown(60);
    } catch (failure) {
      if (currentVersion !== version.current) return;
      setError(failure instanceof Error ? failure.message : idRecoveryUnavailableMessage);
      if (failure instanceof IdRecoveryError && failure.retryAfter) {
        setRetryAt(Date.now() + failure.retryAfter * 1000);
        setCooldown(failure.retryAfter);
        setRateLimited(true);
      }
    } finally {
      requestLock.current = false;
      if (currentVersion === version.current) setIsSubmitting(false);
    }
  }

  return <PasswordRecoveryLayout title="아이디 찾기" description="가입할 때 등록한 이메일을 입력해 주세요. 해당 메일로 아이디를 안내해 드려요." loginPath={loginPath}>
    {submitted && <div role="status" className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6">
      <MailCheck aria-hidden="true" className="mb-2 h-6 w-6 text-primary" />
      <p className="font-medium">가입한 이메일로 아이디 안내를 보냈습니다. 메일함을 확인해 주세요.</p>
      <p className="mt-1 text-muted-foreground">메일이 보이지 않으면 스팸함도 확인해 주세요. 메일에서 아이디를 확인한 뒤 로그인하거나 비밀번호를 찾을 수 있습니다.</p>
    </div>}
    <form onSubmit={handleSubmit} noValidate aria-label="아이디 안내 메일 요청" aria-busy={isSubmitting} className="space-y-5">
      <div>
        <label htmlFor="find-id-email" className="text-sm font-medium">이메일</label>
        <input id="find-id-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} placeholder="name@example.com" value={email}
          onChange={(event) => {
            const nextEmail = event.target.value;
            // Match the server's email quota key; a different account may make its own request.
            if (nextEmail.trim().toLowerCase() !== email.trim().toLowerCase()) {
              setRetryAt(0); setCooldown(0); setRateLimited(false);
            }
            version.current += 1; setEmail(nextEmail); setEmailError(null); setError(null); setSubmitted(false); setIsSubmitting(false);
          }} disabled={isSubmitting}
          className={recoveryInputClassName} aria-invalid={Boolean(emailError)} aria-describedby={`find-id-email-help${emailError ? " find-id-email-error" : ""}`} />
        <p id="find-id-email-help" className="mt-2 text-xs leading-5 text-muted-foreground">가입할 때 등록한 이메일로만 메일을 보낼 수 있어요.</p>
        {emailError && <p id="find-id-email-error" role="alert" className="mt-2 text-xs text-destructive">{emailError}</p>}
      </div>
      {(error || rateLimited) && <p role="alert" className="text-sm leading-6 text-destructive">{rateLimited ? recoveryWaitMessage(cooldown) : error}</p>}
      <button type="submit" disabled={isSubmitting || cooldown > 0} className={recoveryButtonClassName}>
        {isSubmitting && <span aria-hidden="true"><LoaderOne variant="inverse" /></span>}
        {isSubmitting ? "요청 중..." : cooldown > 0 ? `다시 보내기 (${formatRecoveryWait(cooldown)} 후)` : submitted ? "아이디 안내 메일 다시 보내기" : "아이디 안내 메일 보내기"}
      </button>
    </form>
    <Link to={authPathWithReturnTo("/forgot-password", returnTo)} className="mt-5 block text-center text-sm text-primary hover:underline">비밀번호도 모르겠어요 · 비밀번호 찾기</Link>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">카카오로 가입했다면 로그인 화면에서 카카오 로그인을 이용해 주세요.</p>
  </PasswordRecoveryLayout>;
}
