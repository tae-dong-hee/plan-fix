import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import SignupForm, {
  type SignupFormMessage,
  type SignupFormValues,
} from "@/components/ui/signup-form";
import { authPathWithReturnTo, getInviteReturnTo } from "@/lib/auth-return-to";
import { checkEmailAvailability, checkUsernameAvailability, isUserApiConfigured, signUp } from "@/services/user";

const redirectDelay = 1500;
const demoDelay = 600;

const wait = (duration: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration));

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginPath = authPathWithReturnTo("/login", getInviteReturnTo(searchParams.get("returnTo")));
  const [message, setMessage] = useState<SignupFormMessage | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: SignupFormValues) => {
    setMessage(null);
    setIsSubmitting(true);

    try {
      if (!isUserApiConfigured()) {
        if (values.phoneVerificationToken) throw new Error("현재 회원가입 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
        await wait(demoDelay);
        setMessage({
          tone: "success",
          text: `${values.name || values.loginId}님의 회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.`,
        });
        await wait(redirectDelay);
        navigate(loginPath, { replace: true });
        return;
      }

      await signUp({
        loginId: values.loginId,
        password: values.password,
        name: values.name || null,
        email: values.email || null,
        birthDate: values.birthDate || null,
        ...(values.phoneVerificationToken ? { phoneVerificationToken: values.phoneVerificationToken } : {}),
      });

      setMessage({
        tone: "success",
        text: "회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.",
      });
      await wait(redirectDelay);
      navigate(loginPath, { replace: true });
    } catch (error) {
      const text = error instanceof Error ? error.message : "회원가입 중 오류가 발생했습니다.";
      setMessage({
        tone: "error",
        text,
      });
      if (text === "이미 가입된 이메일입니다.") return { emailError: text };
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-start justify-center overflow-x-hidden overflow-y-auto bg-gradient-to-b from-primary/10 via-background to-background px-3 py-6 sm:items-center sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-lg border bg-background/95 p-4 shadow-panel backdrop-blur-sm sm:p-8 lg:p-10" aria-label="PlanFix 회원가입">
        <SignupForm
          isSubmitting={isSubmitting}
          message={message}
          onSubmit={handleSubmit}
          onCheckEmailAvailability={checkEmailAvailability}
          onCheckUsernameAvailability={async (username) => checkUsernameAvailability(username)}
          loginHref={loginPath}
          onBackToLogin={() => navigate(loginPath)}
        />
      </section>
    </main>
  );
}
