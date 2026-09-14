export type SignUpRequest = {
  loginId: string;
  password: string;
  name?: string | null;
  email?: string | null;
  username?: string | null;
  birthDate?: string | null;
};

export type SignUpResponse = {
  userId: number;
  username: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};
export type UserProfile = SignUpResponse;

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

export function isUserApiConfigured() {
  return Boolean(apiBaseUrl);
}

export async function checkUsernameAvailability(username: string): Promise<{ available: boolean; message: string }> {
  if (!apiBaseUrl) throw new Error("VITE_API_BASE_URL이 설정되지 않았습니다.");
  const response = await fetch(`${apiBaseUrl}/users/username-availability?username=${encodeURIComponent(username)}`, { credentials: "include" });
  if (!response.ok) throw new Error("아이디 중복 확인에 실패했습니다.");
  return (await response.json()) as { available: boolean; message: string };
}

export async function signUp(payload: SignUpRequest): Promise<SignUpResponse> {
  if (!apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL이 설정되지 않았습니다.");
  }

  const response = await fetch(`${apiBaseUrl}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? "회원가입할 수 없습니다. 입력 정보를 확인해 주세요.");
  }

  return (await response.json()) as SignUpResponse;
}

async function profileRequest(path: string, init?: RequestInit): Promise<UserProfile> {
  if (!apiBaseUrl) throw new Error("VITE_API_BASE_URL이 설정되지 않았습니다.");
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    if (response.status === 401) throw new Error("로그인이 필요합니다.");
    throw new Error(body?.message ?? "프로필을 처리할 수 없습니다.");
  }
  return (await response.json()) as UserProfile;
}

export function fetchMyProfile() { return profileRequest("/users/me"); }

export function updateMyProfile(payload: Pick<UserProfile, "username" | "name" | "email">) {
  return profileRequest("/users/me", { method: "PATCH", body: JSON.stringify(payload) });
}
