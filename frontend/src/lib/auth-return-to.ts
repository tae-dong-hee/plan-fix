const pendingReturnToKey = "planfix.auth.invite-return-to";
const pendingReturnToTtl = 15 * 60 * 1000;

// Authentication can resume only an invitation; never redirect to arbitrary URLs.
export function getInviteReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^\/course-invites\/[A-Za-z0-9_-]+/.exec(value)?.[0] === value ? value : null;
}

export function authPathWithReturnTo(path: "/login" | "/signup" | "/forgot-password" | "/find-id" | "/reset-password", returnTo: string | null) {
  const safeReturnTo = getInviteReturnTo(returnTo);
  return safeReturnTo ? `${path}?${new URLSearchParams({ returnTo: safeReturnTo })}` : path;
}

export function clearPendingAuthReturnTo() {
  try {
    window.sessionStorage.removeItem(pendingReturnToKey);
  } catch {
    // Browser privacy settings can make storage unavailable.
  }
}

export function savePendingAuthReturnTo(returnTo: string | null) {
  clearPendingAuthReturnTo();
  const path = getInviteReturnTo(returnTo);
  if (!path) return;
  try {
    window.sessionStorage.setItem(pendingReturnToKey, JSON.stringify({ path, createdAt: Date.now() }));
  } catch {
    // Login remains available when the browser disallows session storage.
  }
}

export function readPendingAuthReturnTo(): string | null {
  try {
    const raw = window.sessionStorage.getItem(pendingReturnToKey);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (typeof saved === "object" && saved !== null && "path" in saved && "createdAt" in saved) {
      const path = typeof saved.path === "string" ? getInviteReturnTo(saved.path) : null;
      const age = typeof saved.createdAt === "number" ? Date.now() - saved.createdAt : NaN;
      if (path && age >= 0 && age < pendingReturnToTtl) return path;
    }
  } catch {
    // Discard invalid or inaccessible storage instead of interrupting login.
  }
  clearPendingAuthReturnTo();
  return null;
}
