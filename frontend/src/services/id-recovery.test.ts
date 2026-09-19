import { setApiBaseUrl } from "@/test-utils/env";

const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const originalFetch = global.fetch;
beforeEach(() => { setApiBaseUrl("http://localhost:8080/api/v1/"); vi.resetModules(); });
afterEach(() => { setApiBaseUrl(originalApiBaseUrl); global.fetch = originalFetch; vi.resetModules(); });

test("가입 이메일을 본문으로 보내고 204 빈 응답을 처리한다", async () => {
  const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  global.fetch = fetchSpy;
  const { requestIdRecovery } = await import("./id-recovery");
  await expect(requestIdRecovery({ email: "user@example.com" })).resolves.toBeUndefined();
  expect(fetchSpy).toHaveBeenCalledWith("http://localhost:8080/api/v1/auth/id-recovery/request", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", referrerPolicy: "no-referrer",
    body: JSON.stringify({ email: "user@example.com" }),
  });
});

test("연결하지 않은 환경에서는 가짜 발송 성공을 반환하지 않는다", async () => {
  setApiBaseUrl(undefined); global.fetch = vi.fn();
  const { requestIdRecovery, idRecoveryUnavailableMessage } = await import("./id-recovery");
  await expect(requestIdRecovery({ email: "user@example.com" })).rejects.toThrow(idRecoveryUnavailableMessage);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("등록 이메일 불일치를 지정된 한글 문구로 전달한다", async () => {
  global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "RECOVERY_EMAIL_MISMATCH", message: "internal reason" }), { status: 400 }));
  const { requestIdRecovery, idRecoveryEmailMismatchMessage } = await import("./id-recovery");
  await expect(requestIdRecovery({ email: "wrong@example.com" })).rejects.toThrow(idRecoveryEmailMismatchMessage);
});

test.each([["90", 90], ["3600", 3600], [null, 60], ["-10", 60], ["NaN", 60], ["1.5", 60], ["0", 60]])("429 요청 제한과 유효한 Retry-After 대기 시간을 보존한다: %s", async (header, retryAfter) => {
  global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: header ? { "Retry-After": String(header) } : {} }));
  const { requestIdRecovery } = await import("./id-recovery");
  await expect(requestIdRecovery({ email: "user@example.com" })).rejects.toMatchObject({ retryAfter });
});

test("메일 서버 장애와 네트워크 장애는 발송 성공으로 처리하지 않는다", async () => {
  global.fetch = vi.fn().mockResolvedValue(new Response("SMTP authentication failed", { status: 503 }));
  const { requestIdRecovery, idRecoveryUnavailableMessage } = await import("./id-recovery");
  await expect(requestIdRecovery({ email: "user@example.com" })).rejects.toThrow(idRecoveryUnavailableMessage);
  global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  await expect(requestIdRecovery({ email: "user@example.com" })).rejects.toThrow("인터넷 연결을 확인");
});

test("아이디를 포함한 잘못된 성공 응답도 화면에 반환하지 않는다", async () => {
  global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ loginId: "private-id" }), { status: 200 }));
  const { requestIdRecovery, idRecoveryUnavailableMessage } = await import("./id-recovery");
  await expect(requestIdRecovery({ email: "user@example.com" })).rejects.toThrow(idRecoveryUnavailableMessage);
});
