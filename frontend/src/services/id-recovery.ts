import { recoveryRetryAfter, recoveryWaitMessage } from "@/lib/recovery-retry";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

export const idRecoveryUnavailableMessage = "현재 아이디 안내 메일을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.";
export const idRecoveryEmailMismatchMessage = "등록된 이메일이 일치하지 않습니다. 가입한 이메일을 확인해 주세요.";

export class IdRecoveryError extends Error {
  constructor(message: string, public readonly retryAfter = 0) {
    super(message);
    this.name = "IdRecoveryError";
  }
}

export async function requestIdRecovery(payload: { email: string }): Promise<void> {
  if (!apiBaseUrl) throw new IdRecoveryError(idRecoveryUnavailableMessage);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/auth/id-recovery/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      referrerPolicy: "no-referrer",
      body: JSON.stringify({ email: payload.email }),
    });
  } catch {
    throw new IdRecoveryError("서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
  // The API intentionally never returns the account ID; it is sent only by email.
  if (response.status === 204) return;
  const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
  if (body?.code === "RECOVERY_EMAIL_MISMATCH") throw new IdRecoveryError(idRecoveryEmailMismatchMessage);
  if (response.status === 429) {
    const retryAfter = recoveryRetryAfter(response.headers);
    throw new IdRecoveryError(recoveryWaitMessage(retryAfter), retryAfter);
  }
  throw new IdRecoveryError(response.status >= 500 || response.ok ? idRecoveryUnavailableMessage : body?.message || idRecoveryUnavailableMessage);
}
