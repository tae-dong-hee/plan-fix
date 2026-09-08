import { consumeInvitationReturn, consumeKakaoInvitationReturn, markKakaoInvitationReturn, readInvitationReturn, readKakaoInvitationReturn, rememberInvitationReturn, safeInvitationReturn } from "./auth-return";

const path = "/invite#token=valid_token-123";

describe("invitation login return", () => {
  beforeEach(() => {
    sessionStorage.clear();
    consumeInvitationReturn();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T03:00:00Z"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    consumeInvitationReturn();
    vi.useRealTimers();
  });

  test("only remembers the invitation route and consumes it once", () => {
    expect(safeInvitationReturn(path)).toBe(path);
    expect(rememberInvitationReturn(path)).toBe(true);
    expect(readInvitationReturn()).toBe(path);
    expect(consumeInvitationReturn()).toBe(path);
    expect(consumeInvitationReturn()).toBeNull();
  });

  test.each([
    "https://evil.example/invite#token=x", "//evil.example/invite#token=x", "/\\evil.example",
    "/%69nvite#token=x", "/invite#token=%2F%2Fevil", "/invite#token=x%0Ahttps://evil.example",
    "/invite?returnTo=https://evil.example#token=x", "/invite#token=x\n", "/main", "javascript:alert(1)",
  ])("rejects untrusted return path %s", (value) => {
    expect(safeInvitationReturn(value)).toBeNull();
    expect(rememberInvitationReturn(value)).toBe(false);
    expect(readInvitationReturn()).toBeNull();
  });

  test("Kakao return is only active after explicitly starting that login", () => {
    rememberInvitationReturn(path);
    expect(readKakaoInvitationReturn()).toBeNull();
    expect(consumeKakaoInvitationReturn()).toBeNull();
    expect(readInvitationReturn()).toBe(path);
    markKakaoInvitationReturn();
    expect(readKakaoInvitationReturn()).toBe(path);
    expect(readKakaoInvitationReturn()).toBe(path);
    expect(consumeKakaoInvitationReturn()).toBe(path);
    expect(readInvitationReturn()).toBeNull();
  });

  test("expires a forgotten login return after thirty minutes", () => {
    rememberInvitationReturn(path);
    markKakaoInvitationReturn();
    vi.advanceTimersByTime(31 * 60_000);
    expect(readInvitationReturn()).toBeNull();
    expect(readKakaoInvitationReturn()).toBeNull();
  });

  test("does not trust a redirect URL injected into browser storage", () => {
    sessionStorage.setItem("planfix:invitation-login-return", JSON.stringify({ path: "//evil.example", createdAt: Date.now(), kakaoPending: true }));
    expect(readInvitationReturn()).toBeNull();
    expect(readKakaoInvitationReturn()).toBeNull();
  });

  test("password login can keep its safe return in memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(rememberInvitationReturn(path)).toBe(false);
    expect(readInvitationReturn()).toBe(path);
    expect(consumeInvitationReturn()).toBe(path);
    expect(readInvitationReturn()).toBeNull();
  });
});
