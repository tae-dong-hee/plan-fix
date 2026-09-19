import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import LoginForm, {
  type LoginFormMessage,
  type LoginFormValues,
} from "@/components/ui/login-form";
import TravelGlobeTransition from "@/components/ui/travel-globe-transition";
import {
  authPathWithReturnTo,
  clearPendingAuthReturnTo,
  getInviteReturnTo,
  readPendingAuthReturnTo,
  savePendingAuthReturnTo,
} from "@/lib/auth-return-to";
import { isAuthApiConfigured, signIn, startKakaoSignIn } from "@/services/auth";

const heroImage =
  "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1600&q=85";

const demoLoginDelay = 900;
const mainTransitionDuration = 1600;

// 카카오 콜백이 실패하면 백엔드가 /login?error=...으로 돌려보낸다.
const kakaoErrorMessages: Record<string, string> = {
  denied: "카카오 로그인을 취소했습니다.",
  invalid_state: "로그인 요청이 만료되었습니다. 다시 시도해 주세요.",
  kakao_config: "카카오 로그인 설정에 문제가 있습니다. 잠시 후 다시 시도해 주세요.",
  kakao_unavailable: "카카오 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  unknown: "로그인 중 문제가 발생했습니다. 다시 시도해 주세요.",
};

const wait = (duration: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, duration));

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [callbackReturnTo] = useState(() => searchParams.has("error") ? readPendingAuthReturnTo() : null);
  const returnTo = getInviteReturnTo(searchParams.get("returnTo")) ?? callbackReturnTo;
  const signupPath = authPathWithReturnTo("/signup", returnTo);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [message, setMessage] = useState<LoginFormMessage | null>(() => {
    const kakaoError = searchParams.get("error");
    if (kakaoError) {
      return {
        tone: "error",
        text: kakaoErrorMessages[kakaoError] ?? kakaoErrorMessages.unknown,
      };
    }
    return isAuthApiConfigured()
      ? null
      : {
          tone: "info",
          text: "개발 데모: 아이디와 비밀번호를 입력하면 메인 화면으로 이동합니다.",
        };
  });

  useEffect(() => {
    if (callbackReturnTo && !getInviteReturnTo(searchParams.get("returnTo"))) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("returnTo", callbackReturnTo);
      setSearchParams(nextParams, { replace: true });
    }
    // Preserve failed OAuth attempts in the URL before removing their session data.
    clearPendingAuthReturnTo();
  }, [callbackReturnTo, searchParams, setSearchParams]);

  const handleSubmit = async (values: LoginFormValues) => {
    setMessage(null);

    setIsSubmitting(true);

    try {
      if (!isAuthApiConfigured()) {
        await wait(demoLoginDelay);
        setIsTransitioning(true);
        await wait(mainTransitionDuration);
        navigate(returnTo ?? "/main", { replace: true });
        return;
      }

      const result = await signIn({
        loginId: values.loginId,
        password: values.password,
      });
      setMessage({
        tone: "success",
        text: `${result.user.username}님, 환영합니다.`,
      });
      setIsTransitioning(true);
      await wait(mainTransitionDuration);
      clearPendingAuthReturnTo();
      navigate(returnTo ?? "/main", { replace: true });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "예상하지 못한 오류가 발생했습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKakaoLogin = () => {
    if (!isAuthApiConfigured()) {
      setMessage({
        tone: "info",
        text: "카카오 로그인은 백엔드 연결이 필요합니다. VITE_API_BASE_URL을 설정해 주세요.",
      });
      return;
    }

    savePendingAuthReturnTo(returnTo);
    try {
      startKakaoSignIn();
    } catch (error) {
      clearPendingAuthReturnTo();
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "카카오 로그인을 시작할 수 없습니다.",
      });
    }
  };

  if (isTransitioning) return <TravelGlobeTransition />;

  return (
    <main className="grid min-h-dvh overflow-x-hidden bg-background md:grid-cols-2">
      <section className="relative hidden h-full min-h-0 overflow-hidden md:flex md:items-end" aria-label="PlanFix 소개">
        <img
          className="absolute inset-0 h-full w-full object-cover"
          src={heroImage}
          alt="산과 호수가 어우러진 여행지 풍경"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className="relative z-10 max-w-xl p-10 text-white lg:p-16">
          <div className="mb-5 flex items-center gap-2.5">
            <img src="/logo.png" alt="PlanFix 로고" className="h-9 w-9 rounded-xl object-cover bg-black shadow-md" />
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-white/80">PlanFix</p>
          </div>
          <h2 className="text-4xl font-semibold leading-tight lg:text-5xl">
            여행의 순간을<br />계획으로 완성하세요.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-white/85">
            가고 싶은 곳부터 꼭 해야 할 일까지 한눈에 정리하고, 설레는 여정을 차근차근 준비해 보세요.
          </p>
        </div>
      </section>

      <section className="flex min-h-dvh flex-col px-6 py-4 sm:px-10 sm:py-8 md:px-8 lg:px-16">
        <div className="flex items-center gap-2 text-lg font-semibold tracking-tight text-primary md:invisible">
          <img src="/logo.png" alt="PlanFix 로고" className="h-6 w-6 rounded-md object-cover bg-black shadow-sm" />
          <span>PlanFix</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-2 sm:py-6 md:py-10">
          <LoginForm
            isSubmitting={isSubmitting}
            message={message}
            onSubmit={handleSubmit}
            onKakaoLogin={handleKakaoLogin}
            forgotPasswordHref={authPathWithReturnTo("/forgot-password", returnTo)}
            findIdHref={authPathWithReturnTo("/find-id", returnTo)}
            initialLoginId={searchParams.get("loginId") ?? ""}
            signUpHref={signupPath}
            onSignUp={() => navigate(signupPath)}
          />
        </div>
      </section>
    </main>
  );
}
