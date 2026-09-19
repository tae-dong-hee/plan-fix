import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PasswordRecoveryLayout, { recoveryButtonClassName } from "@/components/ui/password-recovery-layout";
import PhoneVerification from "@/components/ui/phone-verification";
import { authPathWithReturnTo, getInviteReturnTo } from "@/lib/auth-return-to";
import type { PhoneConfirmation } from "@/services/phone-verification";

export default function FindIdPage() {
  const [searchParams] = useSearchParams();
  const returnTo = getInviteReturnTo(searchParams.get("returnTo"));
  const [result, setResult] = useState<PhoneConfirmation | null>(null);
  const loginPath = authPathWithReturnTo("/login", returnTo);
  const loginParams = new URLSearchParams(returnTo ? { returnTo } : {});
  if (result?.loginId) loginParams.set("loginId", result.loginId);

  return <PasswordRecoveryLayout title="아이디 찾기" description="계정에 등록하고 인증한 휴대폰번호로 아이디를 찾아보세요." loginPath={loginPath}>
    <p className="mb-5 rounded-xl bg-muted/50 p-4 text-xs leading-6 text-muted-foreground">가입할 때 또는 내 프로필에서 인증한 휴대폰번호만 사용할 수 있습니다. 아직 번호를 등록하지 않았다면 아이디 찾기는 이용할 수 없습니다. 아이디를 알고 있다면 이메일로 비밀번호를 찾을 수 있어요.</p>
    {result?.loginId ? <div className="space-y-5">
      <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
        <p className="text-sm text-muted-foreground">등록된 아이디입니다</p>
        <p className="mt-2 break-all text-xl font-semibold">{result.loginId}</p>
      </div>
      <Link to={`/login?${loginParams}`} className={recoveryButtonClassName}>이 아이디로 로그인</Link>
      {result.passwordResetToken && <Link to={`${authPathWithReturnTo("/reset-password", returnTo)}#token=${encodeURIComponent(result.passwordResetToken)}`} className="flex min-h-12 items-center justify-center rounded-full border border-primary px-4 text-sm font-medium text-primary hover:bg-primary/5">이 계정의 비밀번호 재설정</Link>}
    </div> : <PhoneVerification purpose="FIND_ID" onVerified={setResult} />}
    <Link to={authPathWithReturnTo("/forgot-password", returnTo)} className="mt-5 block text-center text-sm text-primary hover:underline">이메일로 비밀번호 찾기</Link>
    <p className="mt-5 text-xs leading-5 text-muted-foreground">카카오로 가입했다면 로그인 화면에서 카카오 로그인을 이용해 주세요.</p>
  </PasswordRecoveryLayout>;
}
