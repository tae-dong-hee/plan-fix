const storageKey = "planfix:invitation-login-return";
const lifetime = 30 * 60 * 1000;

type InvitationReturn = { path: string; createdAt: number; kakaoPending: boolean };
let fallback: InvitationReturn | null = null;

// Only our invitation route and a URL-safe token are accepted, never arbitrary redirects.
export function safeInvitationReturn(value: unknown): string | null {
  return typeof value === "string" && value.trim() === value && /^\/invite#token=[A-Za-z0-9_-]{1,512}$/.test(value)
    ? value
    : null;
}

function clearReturn() {
  fallback = null;
  try { sessionStorage.removeItem(storageKey); } catch { /* Storage can be unavailable. */ }
}

function readReturn(): InvitationReturn | null {
  let saved: unknown = fallback;
  try {
    const raw = sessionStorage.getItem(storageKey);
    saved = raw ? JSON.parse(raw) : null;
  } catch { /* Keep the in-memory return path if browser storage is unavailable. */ }
  if (!saved || typeof saved !== "object") return null;
  const record = saved as Partial<InvitationReturn>;
  if (!safeInvitationReturn(record.path) || typeof record.createdAt !== "number"
    || !Number.isFinite(record.createdAt) || Date.now() - record.createdAt < 0
    || Date.now() - record.createdAt > lifetime || typeof record.kakaoPending !== "boolean") {
    clearReturn();
    return null;
  }
  return record as InvitationReturn;
}

function saveReturn(record: InvitationReturn) {
  fallback = record;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function rememberInvitationReturn(path: string) {
  const safePath = safeInvitationReturn(path);
  if (!safePath) return false;
  return saveReturn({ path: safePath, createdAt: Date.now(), kakaoPending: false });
}

export function readInvitationReturn(): string | null {
  return readReturn()?.path ?? null;
}

export function consumeInvitationReturn(): string | null {
  const path = readInvitationReturn();
  clearReturn();
  return path;
}

export function markKakaoInvitationReturn() {
  const record = readReturn();
  return record ? saveReturn({ ...record, kakaoPending: true }) : false;
}

export function readKakaoInvitationReturn(): string | null {
  const record = readReturn();
  return record?.kakaoPending ? record.path : null;
}

export function consumeKakaoInvitationReturn(): string | null {
  const path = readKakaoInvitationReturn();
  if (path) clearReturn();
  return path;
}
