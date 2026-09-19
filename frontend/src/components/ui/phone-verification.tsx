import { useEffect, useId, useRef, useState } from "react";
import { recoveryButtonClassName, recoveryInputClassName } from "./password-recovery-layout";
import { confirmPhoneVerification, PhoneVerificationError, phoneUnavailableMessage, requestPhoneVerification, type PhoneChallenge, type PhoneConfirmation, type PhonePurpose } from "@/services/phone-verification";

type Props = {
  purpose: PhonePurpose;
  loginId?: string;
  disabled?: boolean;
  optional?: boolean;
  onPhoneChange?: (phoneNumber: string) => void;
  onVerified: (result: PhoneConfirmation | null) => void;
  requestChallenge?: (phoneNumber: string) => Promise<PhoneChallenge>;
  confirmChallenge?: (payload: { challengeId: string; code: string }) => Promise<PhoneConfirmation>;
  bindingKey?: string;
};

export default function PhoneVerification({ purpose, loginId, disabled = false, optional = false, onPhoneChange, onVerified, requestChallenge, confirmChallenge, bindingKey }: Props) {
  const id = useId();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<PhoneChallenge | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<"request" | "confirm" | null>(null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const requestLock = useRef(false);
  const callbacks = useRef({ onVerified, onPhoneChange });
  callbacks.current = { onVerified, onPhoneChange };
  const retrySeconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(timer); version.current += 1; };
  }, []);

  useEffect(() => {
    version.current += 1;
    setChallenge(null);
    setCode("");
    setVerified(false);
    setError(null);
    setBusy(null);
    requestLock.current = false;
    callbacks.current.onVerified(null);
  }, [bindingKey, loginId, purpose]);

  function changePhone(value: string) {
    const normalized = value.replace(/\D/g, "").slice(0, 11);
    version.current += 1;
    setPhoneNumber(normalized);
    setChallenge(null);
    setCode("");
    setVerified(false);
    setError(null);
    setBusy(null);
    requestLock.current = false;
    callbacks.current.onPhoneChange?.(normalized);
    callbacks.current.onVerified(null);
  }

  function showFailure(failure: unknown) {
    setError(failure instanceof Error ? failure.message : phoneUnavailableMessage);
    if (failure instanceof PhoneVerificationError) {
      if (failure.retryAfter) { setRetryAt(Date.now() + failure.retryAfter * 1000); setNow(Date.now()); }
      if (failure.expired) { setExpiresAt(Date.now()); setNow(Date.now()); }
    }
  }

  async function sendCode() {
    if (disabled || requestLock.current || Date.now() < retryAt) return;
    setError(null);
    if (!/^010\d{8}$/.test(phoneNumber)) { setError("010으로 시작하는 휴대폰번호 11자리를 입력해 주세요."); return; }
    if (purpose === "RESET_PASSWORD" && !/^[a-z0-9]{6,20}$/.test(loginId?.trim() ?? "")) { setError("아이디를 영문 소문자와 숫자 6~20자로 입력해 주세요."); return; }
    requestLock.current = true;
    setBusy("request");
    const current = ++version.current;
    setVerified(false);
    callbacks.current.onVerified(null);
    try {
      const result = await (requestChallenge ? requestChallenge(phoneNumber) : requestPhoneVerification({ purpose, phoneNumber, ...(loginId ? { loginId: loginId.trim() } : {}) }));
      if (current !== version.current) return;
      setChallenge(result);
      setCode("");
      setExpiresAt(Date.now() + result.expiresIn * 1000);
      setRetryAt(Date.now() + result.resendAfter * 1000);
      setNow(Date.now());
    } catch (failure) {
      if (current === version.current) showFailure(failure);
    } finally {
      if (current === version.current) { requestLock.current = false; setBusy(null); }
    }
  }

  async function verifyCode() {
    if (disabled || requestLock.current || !challenge || verified) return;
    setError(null);
    if (Date.now() >= expiresAt) { setError("인증번호가 만료되었습니다. 인증번호를 다시 받아 주세요."); return; }
    if (!/^\d{6}$/.test(code)) { setError("문자로 받은 인증번호 6자리를 입력해 주세요."); return; }
    requestLock.current = true;
    setBusy("confirm");
    const current = version.current;
    try {
      const payload = { challengeId: challenge.challengeId, code };
      const result = await (confirmChallenge ? confirmChallenge(payload) : confirmPhoneVerification(payload));
      if (current !== version.current) return;
      if (result.purpose !== purpose || (!confirmChallenge && (purpose === "SIGNUP" ? !result.verificationToken : !result.passwordResetToken || (purpose === "FIND_ID" && !result.loginId)))) throw new Error(phoneUnavailableMessage);
      setVerified(true);
      setCode("");
      callbacks.current.onVerified(result);
    } catch (failure) {
      if (current === version.current) showFailure(failure);
    } finally {
      if (current === version.current) { requestLock.current = false; setBusy(null); }
    }
  }

  return <div className="space-y-4" aria-busy={Boolean(busy)}>
    <div>
      <label htmlFor={`${id}-phone`} className="text-sm font-medium">휴대폰번호{optional ? " (선택)" : ""}</label>
      <input id={`${id}-phone`} type="tel" autoComplete="tel-national" inputMode="tel" maxLength={13} placeholder="01012345678" value={phoneNumber} disabled={disabled || Boolean(busy)} onChange={(event) => changePhone(event.target.value)} className={recoveryInputClassName} aria-describedby={`${id}-help`} />
      <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-muted-foreground">010으로 시작하는 국내 휴대폰번호로 문자 인증번호를 보내드립니다.</p>
    </div>
    {!verified && <button type="button" disabled={disabled || Boolean(busy) || retrySeconds > 0} onClick={() => void sendCode()} className={recoveryButtonClassName}>
      {busy === "request" ? "발송 중..." : retrySeconds > 0 ? `다시 보내기 (${retrySeconds}초 후)` : challenge ? "인증번호 다시 보내기" : "인증번호 받기"}
    </button>}
    {challenge && !verified && <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <p role="status" className="text-xs leading-5 text-muted-foreground">인증번호를 발송했습니다. 문자 수신에 시간이 걸릴 수 있습니다.</p>
      <label htmlFor={`${id}-code`} className="block text-sm font-medium">인증번호</label>
      <input id={`${id}-code`} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} disabled={disabled || Boolean(busy) || remaining === 0} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }} className={recoveryInputClassName} aria-describedby={`${id}-expiry`} />
      <p id={`${id}-expiry`} className={`text-xs ${remaining === 0 ? "text-destructive" : "text-muted-foreground"}`}>{remaining === 0 ? "인증번호가 만료되었습니다. 인증번호를 다시 받아 주세요." : `남은 시간 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}</p>
      <button type="button" disabled={disabled || Boolean(busy) || remaining === 0} onClick={() => void verifyCode()} className={recoveryButtonClassName}>{busy === "confirm" ? "확인 중..." : "인증번호 확인"}</button>
    </div>}
    {verified && <div className="flex items-center justify-between gap-2">
      <p role="status" className="text-sm text-primary">휴대폰 인증이 완료되었습니다.</p>
      <button type="button" disabled={disabled} onClick={() => changePhone(phoneNumber)} className="min-h-10 shrink-0 text-xs text-primary hover:underline">다시 인증하기</button>
    </div>}
    {error && <p role="alert" className="text-sm leading-6 text-destructive">{error}</p>}
  </div>;
}
