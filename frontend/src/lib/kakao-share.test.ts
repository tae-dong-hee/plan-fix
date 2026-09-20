import { vi } from "vitest";

type KakaoSdkMock = {
  init: ReturnType<typeof vi.fn>;
  isInitialized: ReturnType<typeof vi.fn>;
  Share: { sendDefault: ReturnType<typeof vi.fn> };
};
const sdkWindow = window as Window & { Kakao?: KakaoSdkMock };
const scriptSelector = 'script[src^="https://t1.kakaocdn.net/kakao_js_sdk/"]';

function installSdk(initialized = false): KakaoSdkMock {
  const sdk = {
    init: vi.fn(() => { initialized = true; }),
    isInitialized: vi.fn(() => initialized),
    Share: { sendDefault: vi.fn() },
  };
  sdkWindow.Kakao = sdk;
  return sdk;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv("VITE_KAKAO_JS_KEY", " public-kakao-js-key ");
  delete sdkWindow.Kakao;
});

afterEach(() => {
  document.querySelectorAll(scriptSelector).forEach((script) => script.remove());
  delete sdkWindow.Kakao;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

test("키가 없으면 SDK 다운로드 없이 링크 복사를 안내한다", async () => {
  vi.stubEnv("VITE_KAKAO_JS_KEY", "  ");
  const { prepareKakaoShare } = await import("./kakao-share");

  await expect(prepareKakaoShare()).rejects.toThrow("초대 링크를 복사");
  expect(document.querySelector(scriptSelector)).toBeNull();
});

test("동시 요청은 공식 SDK 하나를 로드하고 기존 JavaScript 키로 한 번만 초기화한다", async () => {
  const { prepareKakaoShare } = await import("./kakao-share");
  const first = prepareKakaoShare();

  expect(prepareKakaoShare()).toBe(first);
  const scripts = document.querySelectorAll<HTMLScriptElement>(scriptSelector);
  expect(scripts).toHaveLength(1);
  expect(scripts[0].src).toBe("https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js");
  expect(scripts[0].integrity).toBe("sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy");
  expect(scripts[0].crossOrigin).toBe("anonymous");
  const sdk = installSdk();
  scripts[0].dispatchEvent(new Event("load"));
  await first;
  await prepareKakaoShare();

  expect(sdk.init).toHaveBeenCalledExactlyOnceWith("public-kakao-js-key");
  expect(vi.getTimerCount()).toBe(0);
});

test("초기화된 공유 SDK는 재초기화하거나 다운로드하지 않는다", async () => {
  const sdk = installSdk(true);
  const { prepareKakaoShare } = await import("./kakao-share");

  await prepareKakaoShare();

  expect(sdk.init).not.toHaveBeenCalled();
  expect(document.querySelector(scriptSelector)).toBeNull();
});

test("실제 SDK처럼 init 이후 Share 모듈이 생기는 경우에도 초기화한다", async () => {
  const sdk = installSdk();
  const shareModule = sdk.Share;
  Reflect.deleteProperty(sdk, "Share");
  sdk.init.mockImplementation(() => {
    sdk.isInitialized.mockReturnValue(true);
    sdk.Share = shareModule;
  });
  const { prepareKakaoShare, shareCourseInvite } = await import("./kakao-share");
  await prepareKakaoShare();
  shareCourseInvite({ inviteUrl: "https://planfix.cloud/course-invites/token", courseTitle: "강릉", memberRole: "VIEWER" });
  expect(shareModule.sendDefault).toHaveBeenCalledOnce();
});

test("다운로드 오류 후에는 실패한 스크립트를 제거하고 다시 시도할 수 있다", async () => {
  const { prepareKakaoShare } = await import("./kakao-share");
  const first = prepareKakaoShare();
  document.querySelector(scriptSelector)?.dispatchEvent(new Event("error"));
  await expect(first).rejects.toThrow("불러오지 못했어요");
  expect(document.querySelector(scriptSelector)).toBeNull();

  const retry = prepareKakaoShare();
  expect(retry).not.toBe(first);
  installSdk();
  document.querySelector(scriptSelector)?.dispatchEvent(new Event("load"));
  await retry;
});

test("응답이 없는 SDK는 제한 시간 후 정리되고 재시도할 수 있다", async () => {
  const { prepareKakaoShare } = await import("./kakao-share");
  const first = prepareKakaoShare();
  vi.advanceTimersByTime(12_000);
  await expect(first).rejects.toThrow("다시 시도");
  expect(document.querySelector(scriptSelector)).toBeNull();

  const retry = prepareKakaoShare();
  installSdk();
  document.querySelector(scriptSelector)?.dispatchEvent(new Event("load"));
  await retry;
  expect(vi.getTimerCount()).toBe(0);
});

test("스크립트가 로드되어도 공유 SDK가 없으면 준비 완료로 처리하지 않는다", async () => {
  const { prepareKakaoShare } = await import("./kakao-share");
  const pending = prepareKakaoShare();
  document.querySelector(scriptSelector)?.dispatchEvent(new Event("load"));

  await expect(pending).rejects.toThrow("불러오지 못했어요");
  expect(document.querySelector(scriptSelector)).toBeNull();
});

test("초기화 오류를 안내하고 다음 준비 요청에서 다시 초기화한다", async () => {
  const sdk = installSdk();
  sdk.init.mockImplementationOnce(() => { throw new Error("Invalid app key"); });
  const { prepareKakaoShare } = await import("./kakao-share");

  await expect(prepareKakaoShare()).rejects.toThrow("준비하지 못했어요");
  await prepareKakaoShare();
  expect(sdk.init).toHaveBeenCalledTimes(2);
});

test.each([
  ["VIEWER", "읽기 전용"],
  ["EDITOR", "함께 편집"],
] as const)("%s 초대는 사용자 클릭 안에서 즉시 공유하고 모바일과 PC에 초대 토큰을 유지한다", async (memberRole, label) => {
  const sdk = installSdk();
  const { prepareKakaoShare, shareCourseInvite } = await import("./kakao-share");
  await prepareKakaoShare();
  const inviteUrl = "https://planfix.example/course-invites/a-token_with.dots?source=invite";

  const result = shareCourseInvite({ inviteUrl, courseTitle: "제주 여행", memberRole });

  expect(result).toEqual({ inviteToken: "a-token_with.dots", requestId: expect.any(String) });
  expect(sdk.Share.sendDefault).toHaveBeenCalledExactlyOnceWith({
    objectType: "text",
    text: expect.stringContaining(`제주 여행\n${label}`),
    link: { mobileWebUrl: inviteUrl, webUrl: inviteUrl },
    buttonTitle: "초대 확인하기",
    serverCallbackArgs: { invite_token: "a-token_with.dots", share_request_id: result.requestId },
  });
});

test("긴 이모지 제목에서도 역할 안내와 텍스트 템플릿 길이 제한을 유지한다", async () => {
  const sdk = installSdk(true);
  const { shareCourseInvite } = await import("./kakao-share");

  shareCourseInvite({ inviteUrl: "https://planfix.example/course-invites/token", courseTitle: "🌴".repeat(500), memberRole: "EDITOR" });

  const message = sdk.Share.sendDefault.mock.calls[0][0];
  expect(message.text.length).toBeLessThanOrEqual(200);
  expect(message.text).toContain("함께 편집");
});

test("준비 전 공유는 다운로드를 시작하지 않고 재시도를 안내한다", async () => {
  const { shareCourseInvite } = await import("./kakao-share");

  expect(() => shareCourseInvite({ inviteUrl: "https://planfix.example/course-invites/token", courseTitle: "여행", memberRole: "VIEWER" }))
    .toThrow("잠시 후 다시 시도");
  expect(document.querySelector(scriptSelector)).toBeNull();
});

test("공유 창을 열지 못하면 원본 SDK 오류 대신 링크 복사를 안내한다", async () => {
  const sdk = installSdk(true);
  sdk.Share.sendDefault.mockImplementation(() => { throw new Error("SDK internal error"); });
  const { shareCourseInvite } = await import("./kakao-share");

  expect(() => shareCourseInvite({ inviteUrl: "https://planfix.example/course-invites/token", courseTitle: "여행", memberRole: "VIEWER" }))
    .toThrow("공유 창을 열지 못했어요. 다시 시도하거나 초대 링크를 복사");
});


test("같은 링크를 다시 공유해도 서로 다른 전송 확인 ID를 사용한다", async () => {
  installSdk(true);
  const { shareCourseInvite } = await import("./kakao-share");
  const input = { inviteUrl: "https://planfix.example/course-invites/token", courseTitle: "여행", memberRole: "VIEWER" as const };
  expect(shareCourseInvite(input).requestId).not.toBe(shareCourseInvite(input).requestId);
});
