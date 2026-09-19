import { setApiBaseUrl } from "@/test-utils/env";

const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const originalFetch = global.fetch;
beforeEach(() => { setApiBaseUrl("http://localhost:8080/api/v1/"); vi.resetModules(); });
afterEach(() => { setApiBaseUrl(originalApiBaseUrl); global.fetch = originalFetch; vi.resetModules(); });

test("문자 요청과 확인은 purpose와 challenge를 본문으로 보내고 인증 결과만 반환한다", async () => {
  const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: "opaque-id", expiresIn: 300, resendAfter: 60 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ purpose: "FIND_ID", loginId: "traveler01", passwordResetToken: "reset" })));
  global.fetch = fetchSpy;
  const api = await import("./phone-verification");
  await expect(api.requestPhoneVerification({ purpose: "FIND_ID", phoneNumber: "01012345678" })).resolves.toEqual({ challengeId: "opaque-id", expiresIn: 300, resendAfter: 60 });
  await expect(api.confirmPhoneVerification({ challengeId: "opaque-id", code: "123456" })).resolves.toHaveProperty("loginId", "traveler01");
  expect(fetchSpy).toHaveBeenNthCalledWith(1, "http://localhost:8080/api/v1/auth/phone/request", expect.objectContaining({ method: "POST", credentials: "include", referrerPolicy: "no-referrer", body: JSON.stringify({ purpose: "FIND_ID", phoneNumber: "01012345678" }) }));
  expect(fetchSpy).toHaveBeenNthCalledWith(2, "http://localhost:8080/api/v1/auth/phone/confirm", expect.objectContaining({ body: JSON.stringify({ challengeId: "opaque-id", code: "123456" }) }));
});

test("서비스 미설정은 발송·확인·프로필 모두 실패하고 가짜 인증을 반환하지 않는다", async () => {
  setApiBaseUrl(undefined);
  global.fetch = vi.fn();
  const api = await import("./phone-verification");
  await expect(api.requestPhoneVerification({ purpose: "SIGNUP", phoneNumber: "01012345678" })).rejects.toThrow(api.phoneUnavailableMessage);
  await expect(api.confirmPhoneVerification({ challengeId: "challenge", code: "123456" })).rejects.toThrow(api.phoneUnavailableMessage);
  await expect(api.getMyRecoveryPhone()).rejects.toThrow(api.phoneUnavailableMessage);
  expect(global.fetch).not.toHaveBeenCalled();
});

test("프로필 등록 요청은 현재 비밀번호를 인증된 세션의 전용 API로 보낸다", async () => {
  const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ phoneNumber: null })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ challengeId: "profile-id", expiresIn: 300, resendAfter: 60 })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ phoneNumber: "010****5678" })));
  global.fetch = fetchSpy;
  const api = await import("./phone-verification");
  await api.getMyRecoveryPhone();
  await api.requestMyRecoveryPhone({ phoneNumber: "01012345678", password: "Password1!" });
  await expect(api.confirmMyRecoveryPhone({ challengeId: "profile-id", code: "123456" })).resolves.toEqual({ phoneNumber: "010****5678" });
  expect(fetchSpy).toHaveBeenNthCalledWith(2, "http://localhost:8080/api/v1/users/me/recovery-phone/request", expect.objectContaining({ credentials: "include", body: JSON.stringify({ phoneNumber: "01012345678", password: "Password1!" }) }));
});

test("429의 Retry-After와 만료 오류를 화면에서 처리할 수 있도록 보존한다", async () => {
  global.fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: "요청 제한" }), { status: 429, headers: { "Retry-After": "90" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "인증번호 만료" }), { status: 410 }));
  const api = await import("./phone-verification");
  await expect(api.requestPhoneVerification({ purpose: "FIND_ID", phoneNumber: "01012345678" })).rejects.toMatchObject({ retryAfter: 90 });
  await expect(api.confirmPhoneVerification({ challengeId: "id", code: "123456" })).rejects.toMatchObject({ expired: true });
});

test.each([{}, { challengeId: "id", expiresIn: 0, resendAfter: 60 }, { challengeId: "id", expiresIn: 300 }])("잘못된 성공 응답으로 문자 발송을 완료 처리하지 않는다: %j", async (result) => {
  global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(result)));
  const api = await import("./phone-verification");
  await expect(api.requestPhoneVerification({ purpose: "SIGNUP", phoneNumber: "01012345678" })).rejects.toThrow(api.phoneUnavailableMessage);
});
