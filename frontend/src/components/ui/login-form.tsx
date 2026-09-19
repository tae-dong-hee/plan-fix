import { LockKeyhole, UserRound } from "lucide-react";
import { FormEvent, useRef, useState } from "react";

import KakaoSymbol from "@/components/ui/kakao-symbol";
import KakaoLoginDialog from "@/components/ui/kakao-login-dialog";
import { LoaderOne } from "@/components/ui/unique-loader-components";
import { cn } from "@/lib/utils";

export type LoginFormValues = {
  loginId: string;
  password: string;
  rememberMe: boolean;
};

export type LoginFormMessage = {
  tone: "error" | "info" | "success";
  text: string;
};

type LoginFormProps = {
  className?: string;
  isSubmitting?: boolean;
  message?: LoginFormMessage | null;
  onSubmit?: (values: LoginFormValues) => void | Promise<void>;
  onKakaoLogin?: () => void;
  onSignUp?: () => void;
  forgotPasswordHref?: string;
  findIdHref?: string;
  initialLoginId?: string;
  signUpHref?: string;
};

const fieldClassName =
  "flex h-12 w-full items-center gap-3 overflow-hidden rounded-full border border-input bg-background px-5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15";

const loginIdPattern = /^[a-z0-9]{6,20}$/;
const loginIdRequirementText = "영문 소문자와 숫자로 6~20자로 입력해 주세요.";

type LoginFormErrors = Partial<Record<"loginId" | "password", string>>;

export default function LoginForm({
  className,
  isSubmitting = false,
  message,
  onSubmit,
  onKakaoLogin,
  onSignUp,
  forgotPasswordHref = "/forgot-password",
  findIdHref = "/find-id",
  initialLoginId = "",
  signUpHref = "/signup",
}: LoginFormProps) {
  const [values, setValues] = useState<LoginFormValues>({
    loginId: loginIdPattern.test(initialLoginId.trim()) ? initialLoginId.trim() : "",
    password: "",
    rememberMe: false,
  });
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [isKakaoLoginOpen, setIsKakaoLoginOpen] = useState(false);
  const kakaoLoginRef = useRef<HTMLButtonElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors: LoginFormErrors = {};

    if (!values.loginId.trim()) {
      nextErrors.loginId = "아이디를 입력해 주세요.";
    } else if (!loginIdPattern.test(values.loginId.trim())) {
      nextErrors.loginId = loginIdRequirementText;
    }

    if (!values.password) {
      nextErrors.password = "비밀번호를 입력해 주세요.";
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    await onSubmit?.({ ...values, loginId: values.loginId.trim() });
  };

  return (
    <>
    <form
      className={cn("flex w-full max-w-sm flex-col items-center", className)}
      onSubmit={handleSubmit}
      noValidate
      inert={isKakaoLoginOpen}
    >
      <h1 className="text-4xl font-semibold tracking-tight text-foreground">로그인</h1>
      <p className="mt-3 text-center text-sm text-muted-foreground">
        다시 오신 것을 환영해요! 로그인 후 계속해 주세요.
      </p>

      <button
        ref={kakaoLoginRef}
        type="button"
        className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] text-sm font-medium text-[#191919]/85 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FEE500] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => setIsKakaoLoginOpen(true)}
        aria-haspopup="dialog"
        disabled={isSubmitting}
      >
        <KakaoSymbol className="h-5 w-5 text-black" />
        <span>카카오 로그인</span>
      </button>

      <div className="my-5 flex w-full items-center gap-4" aria-hidden="true">
        <div className="h-px flex-1 bg-border" />
        <p className="whitespace-nowrap text-sm text-muted-foreground">또는 아이디로 로그인</p>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="w-full">
        <label
          className={cn(
            fieldClassName,
            errors.loginId &&
              "border-destructive focus-within:border-destructive focus-within:ring-destructive/15",
          )}
        >
          <span className="sr-only">아이디</span>
          <UserRound
            aria-hidden="true"
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground",
              errors.loginId && "text-destructive",
            )}
          />
          <input
            type="text"
            name="loginId"
            value={values.loginId}
            onChange={(event) => {
              setValues((current) => ({ ...current, loginId: event.target.value }));
              setErrors((current) => ({ ...current, loginId: undefined }));
            }}
            placeholder="아이디"
            autoComplete="username"
            spellCheck={false}
            className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-invalid={Boolean(errors.loginId)}
            aria-describedby={errors.loginId ? "login-loginId-error" : undefined}
            disabled={isSubmitting}
            required
          />
        </label>
        {errors.loginId ? (
          <p id="login-loginId-error" className="mt-1.5 px-5 text-xs text-destructive" role="alert">
            {errors.loginId}
          </p>
        ) : null}
      </div>

      <div className="mt-4 w-full">
        <label
          className={cn(
            fieldClassName,
            errors.password &&
              "border-destructive focus-within:border-destructive focus-within:ring-destructive/15",
          )}
        >
          <span className="sr-only">비밀번호</span>
          <LockKeyhole
            aria-hidden="true"
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground",
              errors.password && "text-destructive",
            )}
          />
          <input
            type="password"
            name="password"
            value={values.password}
            onChange={(event) => {
              setValues((current) => ({ ...current, password: event.target.value }));
              setErrors((current) => ({ ...current, password: undefined }));
            }}
            placeholder="비밀번호"
            autoComplete="current-password"
            className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            disabled={isSubmitting}
            required
          />
        </label>
        {errors.password ? (
          <p id="login-password-error" className="mt-1.5 px-5 text-xs text-destructive" role="alert">
            {errors.password}
          </p>
        ) : null}
      </div>

      <div className="mt-6 w-full text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.rememberMe}
            onChange={(event) =>
              setValues((current) => ({ ...current, rememberMe: event.target.checked }))
            }
            className="h-4 w-4 accent-primary"
            disabled={isSubmitting}
          />
          로그인 상태 유지
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm">
          <a className="inline-flex min-h-8 items-center underline-offset-4 hover:text-primary hover:underline" href={findIdHref}>아이디 찾기</a>
          <a className="inline-flex min-h-8 items-center underline-offset-4 hover:text-primary hover:underline" href={forgotPasswordHref}>
            비밀번호를 잊으셨나요?
          </a>
        </div>
      </div>

      <div className="mt-4 min-h-5 w-full" aria-live="polite">
        {message ? (
          <p
            className={cn(
              "text-sm",
              message.tone === "error" && "text-destructive",
              message.tone === "info" && "text-muted-foreground",
              message.tone === "success" && "text-emerald-600",
            )}
          >
            {message.text}
          </p>
        ) : null}
      </div>

      <button
        type="submit"
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSubmitting}
      >
        {isSubmitting ? <LoaderOne variant="inverse" /> : null}
        {isSubmitting ? "로그인 중..." : "로그인"}
      </button>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        아직 계정이 없으신가요?{" "}
        <a
          className="inline-flex min-h-10 items-center rounded px-1 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={signUpHref}
          onClick={onSignUp ? (event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onSignUp();
          } : undefined}
        >
          회원가입
        </a>
      </p>
    </form>
    {isKakaoLoginOpen && (
      <KakaoLoginDialog
        returnFocusTo={kakaoLoginRef.current}
        onClose={() => setIsKakaoLoginOpen(false)}
        onContinue={() => {
          setIsKakaoLoginOpen(false);
          onKakaoLogin?.();
        }}
      />
    )}
    </>
  );
}
