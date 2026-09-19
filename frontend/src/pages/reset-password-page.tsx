import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import PasswordRecoveryLayout, { recoveryButtonClassName, recoveryInputClassName } from "@/components/ui/password-recovery-layout";
import { LoaderOne } from "@/components/ui/unique-loader-components";
import { authPathWithReturnTo, getInviteReturnTo } from "@/lib/auth-return-to";
import { confirmPasswordReset, invalidPasswordResetLinkMessage, PasswordResetError, passwordResetUnavailableMessage } from "@/services/password-reset";

const passwordPattern = /^(?=.*[A-Za-z])(?=.*[A-Z])(?=.*\d)[\x21-\x7E]{8,20}$/;
const passwordRequirement = "영문·숫자를 조합하고 대문자를 1개 이상 포함해 8~20자로 입력해 주세요.";

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [returnTo] = useState(() => getInviteReturnTo(new URLSearchParams(location.search).get("returnTo")));
  // Read without mutating the URL so StrictMode's repeated initialization is safe.
  // The token lives only in this mounted page; reopening the email restores it after refresh.
  const [token, setToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirmation?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [invalidLink, setInvalidLink] = useState(!token);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const tokenVersion = useRef(0);

  useEffect(() => {
    const incomingToken = new URLSearchParams(location.hash.slice(1)).get("token");
    if (incomingToken) {
      // A reopened email can navigate only the fragment without remounting this page.
      tokenVersion.current += 1;
      setToken(incomingToken);
      setPassword("");
      setConfirmation("");
      setErrors({});
      setError(null);
      setInvalidLink(false);
      setIsSubmitting(false);
      setSucceeded(false);
    }
    if (location.hash || location.search) {
      navigate(location.pathname, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || invalidLink || succeeded) return;
    const nextErrors: typeof errors = {};
    if (!passwordPattern.test(password)) nextErrors.password = passwordRequirement;
    if (!confirmation) nextErrors.confirmation = "비밀번호를 한 번 더 입력해 주세요.";
    else if (password !== confirmation) nextErrors.confirmation = "비밀번호가 일치하지 않습니다.";
    setErrors(nextErrors);
    setError(null);
    if (Object.keys(nextErrors).length) return;
    setIsSubmitting(true);
    const submittedVersion = tokenVersion.current;
    try {
      await confirmPasswordReset({ token, password });
      if (submittedVersion !== tokenVersion.current) return;
      setSucceeded(true);
      setToken("");
      setPassword("");
      setConfirmation("");
    } catch (failure) {
      if (submittedVersion !== tokenVersion.current) return;
      if (failure instanceof PasswordResetError && failure.invalidToken) {
        setInvalidLink(true);
        setToken("");
        setPassword("");
        setConfirmation("");
      } else {
        setError(failure instanceof Error ? failure.message : passwordResetUnavailableMessage);
      }
    } finally {
      if (submittedVersion === tokenVersion.current) setIsSubmitting(false);
    }
  }

  return (
    <PasswordRecoveryLayout title={succeeded ? "비밀번호 변경 완료" : "새 비밀번호 설정"} description={succeeded ? "이제 새 비밀번호로 로그인해 주세요." : "PlanFix에서 사용할 새로운 비밀번호를 입력해 주세요."} loginPath={authPathWithReturnTo("/login", returnTo)}>
      {succeeded ? <div role="status" className="rounded-xl bg-primary/5 p-5 text-sm leading-6">
        <CircleCheck aria-hidden="true" className="mb-3 h-8 w-8 text-primary" />
        비밀번호가 변경되었습니다.
      </div> : invalidLink ? <div>
        <p role="alert" className="text-sm leading-6 text-destructive">{invalidPasswordResetLinkMessage}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">화면을 새로고침했다면 메일의 링크를 다시 열어 주세요.</p>
        <Link to={authPathWithReturnTo("/forgot-password", returnTo)} className={`${recoveryButtonClassName} mt-6`}>재설정 메일 다시 요청하기</Link>
      </div> : <form onSubmit={handleSubmit} noValidate aria-label="새 비밀번호 설정" aria-busy={isSubmitting} className="space-y-5">
        <div>
          <label htmlFor="reset-password" className="text-sm font-medium">새 비밀번호</label>
          <input id="reset-password" name="password" type="password" autoComplete="new-password" required maxLength={20} value={password} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })); }}
            disabled={isSubmitting} className={recoveryInputClassName} aria-invalid={Boolean(errors.password)} aria-describedby="reset-password-requirements" />
          <p id="reset-password-requirements" role={errors.password ? "alert" : undefined} className={`mt-2 text-xs leading-5 ${errors.password ? "text-destructive" : "text-muted-foreground"}`}>{passwordRequirement}</p>
        </div>
        <div>
          <label htmlFor="reset-password-confirmation" className="text-sm font-medium">새 비밀번호 확인</label>
          <input id="reset-password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" required maxLength={20} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setErrors((current) => ({ ...current, confirmation: undefined })); }}
            disabled={isSubmitting} className={recoveryInputClassName} aria-invalid={Boolean(errors.confirmation)} aria-describedby={errors.confirmation ? "reset-confirmation-error" : undefined} />
          {errors.confirmation && <p id="reset-confirmation-error" role="alert" className="mt-2 text-xs text-destructive">{errors.confirmation}</p>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button type="submit" disabled={isSubmitting} className={recoveryButtonClassName}>
          {isSubmitting && <span aria-hidden="true"><LoaderOne variant="inverse" /></span>}
          {isSubmitting ? "변경 중..." : "비밀번호 변경하기"}
        </button>
      </form>}
    </PasswordRecoveryLayout>
  );
}
