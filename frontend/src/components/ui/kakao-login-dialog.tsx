import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import KakaoSymbol from "./kakao-symbol";

// 카카오 공식 복구 페이지는 유효한 continue 주소가 필요하다.
const kakaoAccountRecoveryHref =
  "https://accounts.kakao.com/weblogin/find_account?continue=https%3A%2F%2Faccounts.kakao.com%2Fweblogin%2Faccount&lang=ko&showHeader=false";
const kakaoPasswordRecoveryHref =
  "https://accounts.kakao.com/weblogin/find_password?continue=%2Flogin%3Fcontinue%3Dhttps%253A%252F%252Faccounts.kakao.com%252Fweblogin%252Faccount%26talk_login%3D&lang=ko&showHeader=false";

export default function KakaoLoginDialog({ onClose, onContinue, returnFocusTo }: {
  onClose: () => void;
  onContinue: () => void;
  returnFocusTo: HTMLElement | null;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = returnFocusTo;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    continueRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [returnFocusTo]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kakao-login-title"
        aria-describedby="kakao-login-description"
        className="relative max-h-[calc(100dvh-32px)] w-full max-w-sm overflow-y-auto rounded-3xl bg-background px-6 pb-7 pt-9 shadow-2xl sm:px-8"
      >
        <button
          type="button"
          aria-label="카카오 로그인 닫기"
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onClose}
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FEE500]">
          <KakaoSymbol className="h-7 w-7 text-[#191919]" />
        </div>
        <h2 id="kakao-login-title" className="mt-5 text-center text-2xl font-semibold tracking-tight">카카오 로그인</h2>
        <p id="kakao-login-description" className="mt-2 text-center text-sm leading-6 text-muted-foreground">
          카카오 계정으로 PlanFix를 시작해 보세요.
        </p>
        <button
          ref={continueRef}
          type="button"
          className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-4 py-3 text-sm font-semibold text-[#191919] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b6a400] focus-visible:ring-offset-2"
          onClick={onContinue}
        >
          <KakaoSymbol className="h-5 w-5" />
          카카오로 계속하기
        </button>
        <div className="mt-6 border-t border-border pt-5">
          <p className="text-center text-xs text-muted-foreground">카카오 계정 정보가 기억나지 않나요?</p>
          <nav className="mt-2 flex flex-wrap justify-center gap-x-3" aria-label="카카오 계정 도움말">
            {[
              ["카카오 계정 찾기", kakaoAccountRecoveryHref],
              ["카카오 비밀번호 찾기", kakaoPasswordRecoveryHref],
            ].map(([label, href]) => (
              <a
                key={href}
                className="flex min-h-11 items-center rounded px-1 text-xs font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {label}{" "}<span className="sr-only">(새 창)</span>
              </a>
            ))}
          </nav>
        </div>
      </section>
    </div>,
    document.body,
  );
}
