import { CalendarDays, LockKeyhole, Mail, UserRound } from "lucide-react";
import { FormEvent, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type SignupFormValues = {
  loginId: string;
  name: string;
  birthDate: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

export type SignupFormMessage = {
  tone: "error" | "info" | "success";
  text: string;
};

export type EmailAvailabilityResult = {
  available: boolean;
  message: string;
};

type SignupFormProps = {
  className?: string;
  isSubmitting?: boolean;
  message?: SignupFormMessage | null;
  onSubmit?: (values: SignupFormValues) => void | Promise<void>;
  onCheckEmailAvailability?: (email: string) => Promise<EmailAvailabilityResult>;
  onCheckUsernameAvailability?: (username: string) => Promise<EmailAvailabilityResult>;
  onBackToLogin?: () => void;
  loginHref?: string;
};

const initialValues: SignupFormValues = {
  loginId: "",
  name: "",
  birthDate: "",
  email: "",
  password: "",
  passwordConfirmation: "",
};

const fieldClassName =
  "flex h-11 w-full items-center gap-2.5 rounded-lg border border-input bg-background px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 sm:h-12 sm:gap-3 sm:px-4";

const inputClassName =
  "h-full w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60";

const labelClassName =
  "mb-1 block text-xs font-medium text-foreground sm:mb-2 sm:text-sm";

const helperClassName =
  "mt-0.5 block min-h-4 text-[11px] leading-4 sm:mt-1 sm:min-h-0 sm:text-xs sm:leading-normal";

const loginIdPattern = /^[a-z0-9]{6,20}$/;
const loginIdRequirementText = "영문 소문자와 숫자로 6~20자로 입력해 주세요.";
const passwordPattern = /^(?=.*[A-Za-z])(?=.*[A-Z])(?=.*\d)[\x21-\x7E]{8,20}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const birthDatePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const namePattern = /^[가-힣]{2,7}$/;
const nameRequirementText = "공백 없이 완성된 한글 2~7자로 입력해 주세요.";
const birthDateErrorText = "생년월일을 yyyy-mm-dd 형식에 맞게 입력해 주세요.";
const emailFormatErrorText = "올바른 이메일 형식을 입력해 주세요.";
const passwordRequirementText = "영문·숫자를 조합하고 대문자를 1개 이상 포함해 8~20자로 입력해 주세요.";

const getLoginIdError = (value: string) => {
  if (!value) return "아이디를 입력해 주세요.";
  return loginIdPattern.test(value) ? null : loginIdRequirementText;
};

const getNameError = (value: string) => {
  if (!value) return "이름을 입력해 주세요.";
  return namePattern.test(value) ? null : nameRequirementText;
};

const formatBirthDate = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);

  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
};

const isValidBirthDate = (value: string) => {
  if (!birthDatePattern.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= today
  );
};

export default function SignupForm({
  className,
  isSubmitting = false,
  message,
  onSubmit,
  onCheckEmailAvailability,
  onCheckUsernameAvailability,
  onBackToLogin,
  loginHref = "/login",
}: SignupFormProps) {
  const [values, setValues] = useState<SignupFormValues>(initialValues);
  const [loginIdError, setLoginIdError] = useState<string | null>(null);
  const [loginIdStatus, setLoginIdStatus] = useState<"idle" | "checking" | "available" | "unavailable" | "error">("idle");
  const [loginIdCheckMessage, setLoginIdCheckMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [passwordFormatError, setPasswordFormatError] = useState<string | null>(null);
  const [passwordConfirmationError, setPasswordConfirmationError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle" | "checking" | "available" | "unavailable" | "error">("idle");
  const [emailCheckMessage, setEmailCheckMessage] = useState<string | null>(null);
  const emailCheckVersion = useRef(0);
  const [birthDateError, setBirthDateError] = useState<string | null>(null);

  const updateValue = (field: keyof SignupFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));

    if (field === "loginId") {
      setLoginIdError(null);
      setLoginIdStatus("idle");
      setLoginIdCheckMessage(null);
    }

    if (field === "name") {
      setNameError(null);
    }

    if (field === "password") {
      setPasswordFormatError(null);
      setPasswordConfirmationError(null);
    }

    if (field === "passwordConfirmation") {
      setPasswordConfirmationError(null);
    }

    if (field === "email") {
      emailCheckVersion.current += 1;
      setEmailStatus("idle");
      setEmailCheckMessage(null);
    }

    if (field === "birthDate") {
      setBirthDateError(null);
    }
  };

  const handleLoginIdAvailabilityCheck = async () => {
    const error = getLoginIdError(values.loginId);
    if (error) { setLoginIdError(error); return; }
    if (!onCheckUsernameAvailability) return;
    setLoginIdStatus("checking"); setLoginIdCheckMessage("아이디를 확인하고 있어요.");
    try { const result = await onCheckUsernameAvailability(values.loginId); setLoginIdStatus(result.available ? "available" : "unavailable"); setLoginIdCheckMessage(result.message); }
    catch { setLoginIdStatus("error"); setLoginIdCheckMessage("중복 확인 중 오류가 발생했습니다."); }
  };

  const handleEmailAvailabilityCheck = async () => {
    const checkVersion = ++emailCheckVersion.current;
    if (!emailPattern.test(values.email)) {
      setEmailStatus("error");
      setEmailCheckMessage(emailFormatErrorText);
      return;
    }

    if (!onCheckEmailAvailability) {
      setEmailStatus("error");
      setEmailCheckMessage("이메일 중복 확인 API 연결이 필요합니다.");
      return;
    }

    setEmailStatus("checking");
    setEmailCheckMessage("이메일 중복 여부를 확인하고 있어요.");

    try {
      const result = await onCheckEmailAvailability(values.email);
      if (checkVersion !== emailCheckVersion.current) return;
      setEmailStatus(result.available ? "available" : "unavailable");
      setEmailCheckMessage(result.message);
    } catch {
      if (checkVersion !== emailCheckVersion.current) return;
      setEmailStatus("error");
      setEmailCheckMessage("중복 확인 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  };

  const handleLoginIdBlur = () => {
    setLoginIdError(values.loginId ? getLoginIdError(values.loginId) : null);
  };

  const handleNameBlur = () => {
    setNameError(values.name ? getNameError(values.name) : null);
  };

  const handleBirthDateBlur = () => {
    setBirthDateError(
      values.birthDate && !isValidBirthDate(values.birthDate) ? birthDateErrorText : null,
    );
  };

  const handleEmailBlur = () => {
    if (!values.email) {
      setEmailStatus("idle");
      setEmailCheckMessage(null);
      return;
    }

    if (!emailPattern.test(values.email)) {
      setEmailStatus("error");
      setEmailCheckMessage(emailFormatErrorText);
    }
  };

  const handlePasswordBlur = () => {
    setPasswordFormatError(
      values.password && !passwordPattern.test(values.password)
        ? passwordRequirementText
        : null,
    );
  };

  const handlePasswordConfirmationBlur = () => {
    if (!values.passwordConfirmation) {
      setPasswordConfirmationError(null);
      return;
    }

    if (!values.password) {
      setPasswordConfirmationError("비밀번호를 먼저 입력해 주세요.");
      return;
    }

    setPasswordConfirmationError(
      values.password === values.passwordConfirmation ? null : "비밀번호가 일치하지 않습니다.",
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextLoginIdError = getLoginIdError(values.loginId);

    if (nextLoginIdError) {
      setLoginIdError(nextLoginIdError);
      return;
    }

    setLoginIdError(null);

    if (loginIdStatus !== "available") {
      setLoginIdStatus("error");
      setLoginIdCheckMessage("회원가입 전에 아이디 중복 확인을 완료해 주세요.");
      return;
    }

    const nextNameError = getNameError(values.name);

    if (nextNameError) {
      setNameError(nextNameError);
      return;
    }

    setNameError(null);

    if (values.birthDate && !isValidBirthDate(values.birthDate)) {
      setBirthDateError(birthDateErrorText);
      return;
    }

    setBirthDateError(null);

    if (!passwordPattern.test(values.password)) {
      setPasswordFormatError(passwordRequirementText);
      setPasswordConfirmationError(null);
      return;
    }

    if (emailStatus !== "available") {
      setEmailStatus("error");
      setEmailCheckMessage("회원가입 전에 이메일 중복 확인을 완료해 주세요.");
      return;
    }

    if (values.password !== values.passwordConfirmation) {
      setPasswordFormatError(null);
      setPasswordConfirmationError("비밀번호가 일치하지 않습니다.");
      return;
    }

    setPasswordFormatError(null);
    setPasswordConfirmationError(null);
    await onSubmit?.({
      ...values,
      loginId: values.loginId.trim(),
      name: values.name.trim(),
    });
  };

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={handleSubmit}
      aria-label="회원가입 정보"
      autoComplete="off"
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-1 flex items-center gap-2">
          <img src="/logo.png" alt="PlanFix 로고" className="h-6 w-6 rounded-md object-cover bg-black shadow-sm" />
          <p className="text-xs font-semibold tracking-[0.24em] text-primary sm:text-sm">PLANFIX</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:mt-2 sm:text-3xl">회원가입</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:mt-2 sm:text-sm">
          여행 계획을 시작할 계정을 만들어 보세요.
        </p>
      </div>

      <div className="mt-4 space-y-3 sm:mt-8 sm:space-y-8">
        <div className="block">
          <label htmlFor="signup-login-id" className={labelClassName}>
            아이디
          </label>
          <span className={cn(fieldClassName, loginIdError && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15")}>
            <UserRound aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              id="signup-login-id"
              type="text"
              name="loginId"
              value={values.loginId}
              onChange={(event) => updateValue("loginId", event.target.value)}
              onBlur={handleLoginIdBlur}
              placeholder="영문 소문자·숫자 6~20자"
              autoComplete="username"
              spellCheck={false}
              className={inputClassName}
              aria-invalid={Boolean(loginIdError)}
              aria-describedby="login-id-guidance"
              disabled={isSubmitting}
              minLength={6}
              maxLength={20}
              required
            />
            <button type="button" onClick={() => void handleLoginIdAvailabilityCheck()} disabled={isSubmitting || loginIdStatus === "checking" || !values.loginId} className="h-8 shrink-0 rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary disabled:opacity-50">{loginIdStatus === "checking" ? "확인 중..." : "중복 확인"}</button>
          </span>
          <span
            id="login-id-guidance"
            className={cn(helperClassName, loginIdError ? "text-destructive" : "text-muted-foreground")}
            role={loginIdError ? "alert" : undefined}
          >
            {loginIdError ?? loginIdRequirementText}
          </span>
          {loginIdCheckMessage && <span className={cn(helperClassName, loginIdStatus === "available" ? "text-emerald-600" : "text-destructive")} role="status">{loginIdCheckMessage}</span>}
        </div>

        <div className="block">
          <label htmlFor="signup-name" className={labelClassName}>
            이름
          </label>
          <span className={cn(fieldClassName, nameError && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15")}>
            <UserRound aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              id="signup-name"
              type="text"
              name="name"
              value={values.name}
              onChange={(event) => updateValue("name", event.target.value)}
              onBlur={handleNameBlur}
              placeholder="이름을 입력해 주세요"
              autoComplete="name"
              spellCheck={false}
              className={inputClassName}
              aria-invalid={Boolean(nameError)}
              aria-describedby="name-guidance"
              disabled={isSubmitting}
              maxLength={7}
              required
            />
          </span>
          <span
            id="name-guidance"
            className={cn(helperClassName, nameError ? "text-destructive" : "text-muted-foreground")}
            role={nameError ? "alert" : undefined}
          >
            {nameError ?? nameRequirementText}
          </span>
        </div>

        <div className="block">
          <label htmlFor="signup-birth-date" className={labelClassName}>생년월일</label>
          <span className={cn(fieldClassName, birthDateError && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15")}>
            <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              id="signup-birth-date"
              type="text"
              name="birthDate"
              value={values.birthDate}
              onChange={(event) => updateValue("birthDate", formatBirthDate(event.target.value))}
              onBlur={handleBirthDateBlur}
              placeholder="yyyy-mm-dd"
              autoComplete="bday"
              inputMode="numeric"
              className={inputClassName}
              aria-invalid={Boolean(birthDateError)}
              aria-describedby="birth-date-guidance"
              disabled={isSubmitting}
              maxLength={10}
              pattern="\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])"
              title="yyyy-mm-dd 형식으로 입력해 주세요."
              required
            />
          </span>
          <span
            id="birth-date-guidance"
            className={cn(helperClassName, birthDateError ? "text-destructive" : "text-muted-foreground")}
            role={birthDateError ? "alert" : undefined}
          >
            {birthDateError ?? "예: 1990-01-01"}
          </span>
        </div>

        <div className="block">
          <label htmlFor="signup-email" className={labelClassName}>이메일</label>
          <span className={cn(fieldClassName, (emailStatus === "unavailable" || emailStatus === "error") && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15")}>
            <Mail aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              id="signup-email"
              type="email"
              name="email"
              value={values.email}
              onChange={(event) => updateValue("email", event.target.value)}
              onBlur={handleEmailBlur}
              placeholder="example@planfix.kr"
              autoComplete="email"
              className={inputClassName}
              aria-invalid={emailStatus === "unavailable" || emailStatus === "error"}
              aria-describedby={emailCheckMessage ? "email-availability-message" : undefined}
              disabled={isSubmitting}
              required
            />
            <button
              type="button"
              className="h-8 shrink-0 rounded-md bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleEmailAvailabilityCheck}
              disabled={isSubmitting || emailStatus === "checking" || values.email.length === 0}
            >
              {emailStatus === "checking" ? "확인 중..." : "중복 확인"}
            </button>
          </span>
          <div className="min-h-4 sm:min-h-0">
            {emailCheckMessage ? (
              <span
                id="email-availability-message"
                className={cn(
                  helperClassName,
                  emailStatus === "available" ? "text-emerald-600" : "text-destructive",
                  emailStatus === "checking" && "text-muted-foreground",
                )}
                role={emailStatus === "unavailable" || emailStatus === "error" ? "alert" : "status"}
              >
                {emailCheckMessage}
              </span>
            ) : null}
          </div>
        </div>

        <div className="block">
          <label htmlFor="signup-password" className={labelClassName}>비밀번호</label>
          <span className={cn(fieldClassName, passwordFormatError && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15")}>
            <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              id="signup-password"
              type="password"
              name="password"
              value={values.password}
              onChange={(event) => updateValue("password", event.target.value)}
              onBlur={handlePasswordBlur}
              placeholder="영문·숫자·대문자 조합 8~20자"
              autoComplete="off"
              className={inputClassName}
              aria-invalid={Boolean(passwordFormatError)}
              aria-describedby="password-requirements"
              disabled={isSubmitting}
              minLength={8}
              maxLength={20}
              required
            />
          </span>
          <span
            id="password-requirements"
            className={cn(helperClassName, passwordFormatError ? "text-destructive" : "text-muted-foreground")}
            role={passwordFormatError ? "alert" : undefined}
          >
            {passwordFormatError ?? passwordRequirementText}
          </span>
        </div>

        <div className="block">
          <label htmlFor="signup-password-confirmation" className={labelClassName}>비밀번호 확인</label>
          <span className={cn(fieldClassName, passwordConfirmationError && "border-destructive focus-within:border-destructive focus-within:ring-destructive/15")}>
            <LockKeyhole aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              id="signup-password-confirmation"
              type="password"
              name="passwordConfirmation"
              value={values.passwordConfirmation}
              onChange={(event) => updateValue("passwordConfirmation", event.target.value)}
              onBlur={handlePasswordConfirmationBlur}
              placeholder="비밀번호를 다시 입력해 주세요"
              autoComplete="off"
              className={inputClassName}
              aria-invalid={Boolean(passwordConfirmationError)}
              aria-describedby={passwordConfirmationError ? "password-confirmation-error" : undefined}
              disabled={isSubmitting}
              minLength={8}
              maxLength={20}
              required
            />
          </span>
          <div className="min-h-4 sm:min-h-0">
            {passwordConfirmationError ? (
              <span id="password-confirmation-error" className={cn(helperClassName, "text-destructive")} role="alert">
                {passwordConfirmationError}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {message ? (
        <div className="mt-3 min-h-4 sm:mt-8 sm:min-h-5" aria-live="polite">
          <p
            className={cn(
              "text-xs sm:text-sm",
              message.tone === "error" && "text-destructive",
              message.tone === "info" && "text-muted-foreground",
              message.tone === "success" && "text-emerald-600",
            )}
          >
            {message.text}
          </p>
        </div>
      ) : null}

      <button
        type="submit"
        className={cn(
          "h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:h-12",
          message ? "mt-2 sm:mt-3" : "mt-4 sm:mt-8",
        )}
        disabled={isSubmitting}
      >
        {isSubmitting ? "가입 중..." : "회원가입"}
      </button>

      <p className="mt-3 text-center text-xs text-muted-foreground sm:mt-6 sm:text-sm">
        이미 계정이 있으신가요?{" "}
        <a
          className="font-medium text-primary hover:underline"
          href={loginHref}
          onClick={
            onBackToLogin
              ? (event) => {
                  event.preventDefault();
                  onBackToLogin();
                }
              : undefined
          }
        >
          로그인
        </a>
      </p>
    </form>
  );
}
