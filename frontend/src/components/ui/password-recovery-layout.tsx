import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export const recoveryInputClassName = "mt-2 h-12 w-full rounded-xl border border-input bg-background px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60 aria-[invalid=true]:border-destructive";
export const recoveryButtonClassName = "flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export default function PasswordRecoveryLayout({
  title, description, loginPath, children,
}: {
  title: string;
  description: string;
  loginPath: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-x-hidden bg-gradient-to-b from-primary/10 via-background to-background px-4 py-8 sm:px-8">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
      <section className="relative w-full max-w-md rounded-2xl border bg-background/95 p-6 shadow-panel backdrop-blur-sm sm:p-10" aria-labelledby="recovery-title">
        <div className="mb-8 flex items-center gap-2 text-sm font-semibold tracking-tight text-primary">
          <img src="/logo.png" alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-lg bg-black object-cover" />
          <span>PlanFix</span>
        </div>
        <h1 id="recovery-title" className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-7">{children}</div>
        <Link className="mt-7 flex items-center justify-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline" to={loginPath}>
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          로그인으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
