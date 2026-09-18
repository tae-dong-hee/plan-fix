import { setApiBaseUrl } from "@/test-utils/env";

const profile = {
  userId: 1,
  username: "여행자",
  name: null,
  email: null,
  role: "USER",
  status: "ACTIVE",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  profileImageUrl: "/api/v1/users/me/profile-image?v=1",
  defaultAvatarColor: "blue",
};

const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const originalFetch = global.fetch;

beforeEach(() => {
  setApiBaseUrl("https://api.planfix.example/api/v1/");
  vi.resetModules();
});

afterEach(() => {
  setApiBaseUrl(originalApiBaseUrl);
  global.fetch = originalFetch;
  vi.resetModules();
});

test("인증 쿠키와 multipart file로 프로필 사진을 업로드한다", async () => {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => profile });
  global.fetch = fetchSpy as unknown as typeof fetch;
  const { uploadMyProfileImage } = await import("./user");
  const file = new File(["photo"], "profile.png", { type: "image/png" });

  expect(await uploadMyProfileImage(file)).toEqual(profile);

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://api.planfix.example/api/v1/users/me/profile-image");
  expect(options.method).toBe("POST");
  expect(options.credentials).toBe("include");
  expect(options.body).toBeInstanceOf(FormData);
  expect((options.body as FormData).get("file")).toBe(file);
  expect(new Headers(options.headers).has("Content-Type")).toBe(false);
});

test("프로필 사진을 삭제하고 저장된 기본 이미지 정보를 반환한다", async () => {
  const resetProfile = { ...profile, profileImageUrl: null };
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => resetProfile });
  global.fetch = fetchSpy as unknown as typeof fetch;
  const { removeMyProfileImage } = await import("./user");

  expect(await removeMyProfileImage()).toEqual(resetProfile);
  expect(fetchSpy).toHaveBeenCalledWith(
    "https://api.planfix.example/api/v1/users/me/profile-image",
    expect.objectContaining({ method: "DELETE", credentials: "include" }),
  );
});

test("업로드 실패 시 서버의 오류 메시지를 전달한다", async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ message: "올바른 이미지 파일을 선택해 주세요." }),
  });
  const { uploadMyProfileImage } = await import("./user");

  await expect(uploadMyProfileImage(new File(["invalid"], "invalid.png", { type: "image/png" })))
    .rejects.toThrow("올바른 이미지 파일을 선택해 주세요.");
});

test("API 기준의 이미지 경로를 API 서버 주소로 해석하고 버전을 유지한다", async () => {
  const { getProfileImageSrc } = await import("./user");

  expect(getProfileImageSrc("/api/v1/users/me/profile-image?v=2026-09-19"))
    .toBe("https://api.planfix.example/api/v1/users/me/profile-image?v=2026-09-19");
});

test("이미 절대 주소인 프로필 이미지 경로는 유지한다", async () => {
  const { getProfileImageSrc } = await import("./user");

  expect(getProfileImageSrc("https://cdn.planfix.example/profile.png?v=2"))
    .toBe("https://cdn.planfix.example/profile.png?v=2");
});

test("API가 설정되지 않은 경우 업로드와 삭제는 네트워크 요청을 하지 않는다", async () => {
  setApiBaseUrl(undefined);
  const fetchSpy = vi.fn();
  global.fetch = fetchSpy as unknown as typeof fetch;
  const { uploadMyProfileImage, removeMyProfileImage } = await import("./user");

  await expect(uploadMyProfileImage(new File(["photo"], "profile.png", { type: "image/png" })))
    .rejects.toThrow("VITE_API_BASE_URL이 설정되지 않았습니다.");
  await expect(removeMyProfileImage()).rejects.toThrow("VITE_API_BASE_URL이 설정되지 않았습니다.");
  expect(fetchSpy).not.toHaveBeenCalled();
});
