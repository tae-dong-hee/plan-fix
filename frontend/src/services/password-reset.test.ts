import { setApiBaseUrl } from "@/test-utils/env";

const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const originalFetch = global.fetch;

beforeEach(() => {
  setApiBaseUrl("http://localhost:8080/api/v1/");
  vi.resetModules();
});

afterEach(() => {
  setApiBaseUrl(originalApiBaseUrl);
  global.fetch = originalFetch;
  vi.resetModules();
});

test("재설정 요청은 아이디와 이메일을 보내고 204 빈 응답을 처리한다", async () => {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  global.fetch = fetchSpy as unknown as typeof fetch;
  const { requestPasswordReset } = await import("./password-reset");
  await requestPasswordReset({ loginId: "testuser1", email: "user@example.com" });
  expect(fetchSpy).toHaveBeenCalledWith("http://localhost:8080/api/v1/auth/password-reset/request", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", referrerPolicy: "no-referrer",
    body: JSON.stringify({ loginId: "testuser1", email: "user@example.com" }),
  });
});

test("재설정 확인은 토큰을 URL에 노출하지 않고 새 비밀번호와 함께 본문으로 보낸다", async () => {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 204 });
  global.fetch = fetchSpy as unknown as typeof fetch;
  const { confirmPasswordReset } = await import("./password-reset");
  await confirmPasswordReset({ token: "private-reset-token", password: "NewPassword1!" });
  expect(fetchSpy).toHaveBeenCalledWith("http://localhost:8080/api/v1/auth/password-reset/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", referrerPolicy: "no-referrer",
    body: JSON.stringify({ token: "private-reset-token", password: "NewPassword1!" }),
  });
});

test("API가 연결되지 않은 환경에서는 메일 발송 성공으로 처리하지 않는다", async () => {
  setApiBaseUrl(undefined);
  const fetchSpy = vi.fn();
  global.fetch = fetchSpy as unknown as typeof fetch;
  const { requestPasswordReset, confirmPasswordReset, passwordResetUnavailableMessage } = await import("./password-reset");
  await expect(requestPasswordReset({ loginId: "testuser1", email: "user@example.com" })).rejects.toThrow(passwordResetUnavailableMessage);
  await expect(confirmPasswordReset({ token: "token", password: "Password1!" })).rejects.toThrow(passwordResetUnavailableMessage);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test.each([
  [400, "INVALID_PASSWORD_RESET_TOKEN"],
  [410, undefined],
])("만료되거나 사용한 토큰은 동일하게 재요청 가능한 오류를 반환한다: %s", async (status, code) => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ code, message: "internal reason" }) });
  const { confirmPasswordReset, invalidPasswordResetLinkMessage } = await import("./password-reset");
  await expect(confirmPasswordReset({ token: "invalid", password: "Password1!" })).rejects.toMatchObject({
    message: invalidPasswordResetLinkMessage, invalidToken: true,
  });
});

test("요청 제한 오류에는 다시 시도할 수 있는 안내를 제공한다", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => null });
  const { requestPasswordReset } = await import("./password-reset");
  await expect(requestPasswordReset({ loginId: "testuser1", email: "user@example.com" })).rejects.toThrow("요청이 너무 많습니다.");
});

test("아이디와 이메일 불일치는 지정된 문구로 안내한다", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ code: "RECOVERY_ACCOUNT_MISMATCH" }) });
  const { requestPasswordReset } = await import("./password-reset");
  await expect(requestPasswordReset({ loginId: "testuser1", email: "wrong@example.com" })).rejects.toThrow("아이디 또는 이메일이 일치하지 않습니다.");
});

test("서버 또는 네트워크 장애에도 이해할 수 있는 오류를 반환한다", async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => { throw new Error("not JSON"); } });
  const { requestPasswordReset, passwordResetUnavailableMessage } = await import("./password-reset");
  await expect(requestPasswordReset({ loginId: "testuser1", email: "user@example.com" })).rejects.toThrow(passwordResetUnavailableMessage);
  global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(requestPasswordReset({ loginId: "testuser1", email: "user@example.com" })).rejects.toThrow("인터넷 연결을 확인");
});
