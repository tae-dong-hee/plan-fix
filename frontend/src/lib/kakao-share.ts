import type { CourseInviteRole } from "@/services/course";

type KakaoTextMessage = {
  objectType: "text";
  text: string;
  link: { mobileWebUrl: string; webUrl: string };
  buttonTitle: string;
};

type KakaoShareSdk = {
  init: (appKey: string) => void;
  isInitialized: () => boolean;
  Share: { sendDefault: (message: KakaoTextMessage) => void };
};

type KakaoShareWindow = Window & { Kakao?: KakaoShareSdk };

// Version and integrity must be updated together: https://developers.kakao.com/docs/ko/javascript/download
const SDK_URL = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.3/kakao.min.js";
const SDK_INTEGRITY = "sha384-oroumrnFVE0xtgqyDZJARgERibXg2C28380uaUZz2kHDS5CR7tu20eGiOU6GkTpy";
const LOAD_ERROR = "카카오톡 공유를 불러오지 못했어요. 다시 시도하거나 초대 링크를 복사해 주세요.";
const INIT_ERROR = "카카오톡 공유를 준비하지 못했어요. 초대 링크를 복사해 주세요.";

let preparation: Promise<void> | null = null;

/** 초대 창을 열 때 미리 호출해 공유 버튼 클릭 시 비동기 대기가 없도록 한다. */
export function prepareKakaoShare(): Promise<void> {
  const appKey = import.meta.env.VITE_KAKAO_JS_KEY?.trim();
  if (!appKey) {
    return Promise.reject(new Error("카카오톡 공유가 아직 설정되지 않았어요. 초대 링크를 복사해 주세요."));
  }
  if (preparation) return preparation;

  const sdkWindow = window as KakaoShareWindow;
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let script: HTMLScriptElement | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (script) {
        script.onload = null;
        script.onerror = null;
      }
      if (error) {
        script?.remove();
        reject(error);
      } else resolve();
    };
    const initialize = () => {
      const sdk = sdkWindow.Kakao;
      if (!sdk || typeof sdk.init !== "function" || typeof sdk.isInitialized !== "function") {
        finish(new Error(LOAD_ERROR));
        return;
      }
      try {
        if (!sdk.isInitialized()) sdk.init(appKey);
        // The real SDK only attaches Share when init() completes.
        finish(sdk.isInitialized() && typeof sdk.Share?.sendDefault === "function" ? undefined : new Error(INIT_ERROR));
      } catch {
        finish(new Error(INIT_ERROR));
      }
    };
    const timeout = window.setTimeout(() => finish(new Error(LOAD_ERROR)), 12_000);

    // Kakao (sharing/login SDK) is distinct from kakao (Maps SDK).
    if (sdkWindow.Kakao) {
      initialize();
      return;
    }
    script = document.createElement("script");
    script.src = SDK_URL;
    script.integrity = SDK_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.async = true;
    script.onload = initialize;
    script.onerror = () => finish(new Error(LOAD_ERROR));
    document.head.appendChild(script);
  });
  preparation = promise;
  void promise.catch(() => {
    if (preparation === promise) preparation = null;
  });
  return promise;
}

/** 클릭 이벤트에서 await 없이 호출해야 모바일 앱 실행과 공유 팝업이 허용된다. */
export function shareCourseInvite({ inviteUrl, courseTitle, memberRole }: {
  inviteUrl: string;
  courseTitle: string;
  memberRole: CourseInviteRole;
}): void {
  const sdk = (window as KakaoShareWindow).Kakao;
  if (!sdk || typeof sdk.isInitialized !== "function" || !sdk.isInitialized()
    || typeof sdk.Share?.sendDefault !== "function") {
    throw new Error("카카오톡 공유를 준비하고 있어요. 잠시 후 다시 시도해 주세요.");
  }

  // Keep the title short enough for the text template's 200-character limit, including emoji.
  const title = Array.from(courseTitle.trim() || "여행 코스").slice(0, 70).join("");
  const role = memberRole === "EDITOR" ? "함께 편집" : "읽기 전용";
  try {
    sdk.Share.sendDefault({
      objectType: "text",
      text: `[PlanFix] ${title}\n${role} 초대가 도착했어요. 초대를 확인하고 여행에 참여해 주세요.`,
      link: { mobileWebUrl: inviteUrl, webUrl: inviteUrl },
      buttonTitle: "초대 확인하기",
    });
  } catch {
    throw new Error("카카오톡 공유 창을 열지 못했어요. 다시 시도하거나 초대 링크를 복사해 주세요.");
  }
}
