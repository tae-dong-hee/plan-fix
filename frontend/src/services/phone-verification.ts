const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

export type PhonePurpose = "SIGNUP" | "FIND_ID" | "RESET_PASSWORD";
export type PhoneChallenge = { challengeId: string; expiresIn: number; resendAfter: number };
export type PhoneConfirmation = {
  purpose: PhonePurpose;
  verificationToken?: string;
  loginId?: string;
  passwordResetToken?: string;
  phoneNumber?: string;
};
export type RecoveryPhone = { phoneNumber: string | null };
export const phoneUnavailableMessage = "현재 문자 인증 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export class PhoneVerificationError extends Error {
  constructor(message: string, public readonly retryAfter = 0, public readonly expired = false) {
    super(message);
    this.name = "PhoneVerificationError";
  }
}

async function request<T>(path: string, payload?: object): Promise<T> {
  if (!apiBaseUrl) throw new PhoneVerificationError(phoneUnavailableMessage);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: payload ? "POST" : "GET",
      ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
      credentials: "include",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new PhoneVerificationError("서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string; code?: string; retryAfter?: number } | null;
    const retryHeader = Number(response.headers?.get("Retry-After"));
    const retryAfter = response.status === 429 ? (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : body?.retryAfter || 60) : 0;
    throw new PhoneVerificationError(
      body?.message || (response.status === 401 ? "로그인이 필요합니다. 다시 로그인해 주세요." : response.status === 429 ? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." : phoneUnavailableMessage),
      retryAfter,
      response.status === 410 || body?.code === "PHONE_CODE_EXPIRED" || body?.code === "PHONE_ATTEMPTS_EXCEEDED",
    );
  }
  const result = await response.json().catch(() => null);
  if (!result || typeof result !== "object") throw new PhoneVerificationError(phoneUnavailableMessage);
  return result as T;
}

export async function requestPhoneVerification(payload: { purpose: PhonePurpose; phoneNumber: string; loginId?: string }) {
  return validateChallenge(await request<PhoneChallenge>("/auth/phone/request", payload));
}

function validateChallenge(result: PhoneChallenge): PhoneChallenge {
  if (typeof result.challengeId !== "string" || !result.challengeId || !Number.isFinite(result.expiresIn) || result.expiresIn <= 0 || !Number.isFinite(result.resendAfter) || result.resendAfter < 0) {
    throw new PhoneVerificationError(phoneUnavailableMessage);
  }
  return result;
}

export function confirmPhoneVerification(payload: { challengeId: string; code: string }) {
  return request<PhoneConfirmation>("/auth/phone/confirm", payload);
}

export async function getMyRecoveryPhone() {
  const result = await request<RecoveryPhone>("/users/me/recovery-phone");
  if (result.phoneNumber !== null && typeof result.phoneNumber !== "string") throw new PhoneVerificationError("휴대폰 정보를 불러오지 못했습니다. 다시 시도해 주세요.");
  return result;
}
export async function requestMyRecoveryPhone(payload: { phoneNumber: string; password: string }) {
  return validateChallenge(await request<PhoneChallenge>("/users/me/recovery-phone/request", payload));
}
export function confirmMyRecoveryPhone(payload: { challengeId: string; code: string }) {
  return request<RecoveryPhone>("/users/me/recovery-phone/confirm", payload);
}
