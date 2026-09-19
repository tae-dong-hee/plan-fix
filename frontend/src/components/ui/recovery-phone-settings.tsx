import { useEffect, useState } from "react";
import PhoneVerification from "./phone-verification";
import { recoveryInputClassName } from "./password-recovery-layout";
import { confirmMyRecoveryPhone, getMyRecoveryPhone, requestMyRecoveryPhone } from "@/services/phone-verification";

export default function RecoveryPhoneSettings() {
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getMyRecoveryPhone().then((result) => { if (!cancelled) setPhoneNumber(result.phoneNumber); })
      .catch((failure) => { if (!cancelled) setError(failure instanceof Error ? failure.message : "휴대폰 정보를 불러오지 못했습니다."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);

  return <section aria-labelledby="recovery-phone-title" className="mt-6 space-y-5 rounded-2xl border bg-background p-5 shadow-sm sm:p-7">
    <div>
      <h2 id="recovery-phone-title" className="text-lg font-semibold">계정 복구용 휴대폰</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">아이디·비밀번호 찾기에 사용합니다. 현재 비밀번호를 확인하고 문자 인증을 완료하면 등록됩니다.</p>
    </div>
    {loading ? <p role="status" className="text-sm text-muted-foreground">휴대폰 정보를 불러오는 중...</p> : error ? <div>
      <p role="alert" className="text-sm text-destructive">{error}</p>
      <button type="button" className="mt-3 min-h-10 text-sm font-medium text-primary hover:underline" onClick={() => setReload((value) => value + 1)}>휴대폰 정보 다시 불러오기</button>
    </div> : <>
      <p className="text-sm">{phoneNumber ? `등록된 휴대폰번호: ${phoneNumber}` : "등록된 휴대폰번호가 없습니다. 분실에 대비해 인증한 번호를 등록해 주세요."}</p>
      {saved && <p role="status" className="text-sm text-primary">계정 복구용 휴대폰번호가 저장되었습니다.</p>}
      <div>
        <label htmlFor="recovery-phone-password" className="text-sm font-medium">현재 비밀번호</label>
        <input id="recovery-phone-password" type="password" autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); setSaved(false); }} className={recoveryInputClassName} />
      </div>
      <PhoneVerification purpose="SIGNUP" bindingKey={password}
        onPhoneChange={() => setSaved(false)}
        requestChallenge={(value) => {
          if (!password) return Promise.reject(new Error("현재 비밀번호를 입력해 주세요."));
          return requestMyRecoveryPhone({ phoneNumber: value, password });
        }}
        confirmChallenge={async (payload) => {
          const result = await confirmMyRecoveryPhone(payload);
          if (!result.phoneNumber) throw new Error("휴대폰 등록을 확인할 수 없습니다. 다시 시도해 주세요.");
          return { purpose: "SIGNUP", phoneNumber: result.phoneNumber };
        }}
        onVerified={(result) => {
          if (result?.phoneNumber) { setPhoneNumber(result.phoneNumber); setPassword(""); setSaved(true); }
        }} />
    </>}
  </section>;
}
