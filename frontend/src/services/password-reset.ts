const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

export const passwordResetUnavailableMessage =
  "현재 비밀번호 재설정 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요.";

export const invalidPasswordResetLinkMessage =
  "유효하지 않거나 만료된 링크입니다. 비밀번호 재설정 메일을 다시 요청해 주세요.";

export class PasswordResetError extends Error {
  constructor(message: string, public readonly invalidToken = false) {
    super(message);
    this.name = "PasswordResetError";
  }
}

async function postPasswordReset(path: "request" | "confirm", payload: object): Promise<void> {
  if (!apiBaseUrl) throw new PasswordResetError(passwordResetUnavailableMessage);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/auth/password-reset/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      referrerPolicy: "no-referrer",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new PasswordResetError("서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
    const invalidToken = path === "confirm" &&
      (body?.code === "INVALID_PASSWORD_RESET_TOKEN" || response.status === 410);
    throw new PasswordResetError(
      invalidToken ? invalidPasswordResetLinkMessage :
        response.status === 429 ? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." :
        body?.message ?? passwordResetUnavailableMessage,
      invalidToken,
    );
  }
}

export function requestPasswordReset(payload: { loginId: string; email: string }): Promise<void> {
  return postPasswordReset("request", { loginId: payload.loginId, email: payload.email });
}

export function confirmPasswordReset(payload: { token: string; password: string }): Promise<void> {
  return postPasswordReset("confirm", { token: payload.token, password: payload.password });
}
