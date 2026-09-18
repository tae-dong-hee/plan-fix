import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ProfilePage from "./profile-page";
import {
  fetchMyProfile,
  removeMyProfileImage,
  updateMyProfile,
  uploadMyProfileImage,
  type UserProfile,
} from "@/services/user";

vi.mock("@/components/ui/app-nav", () => ({ default: () => null }));
vi.mock("@/services/user", () => ({
  fetchMyProfile: vi.fn(),
  updateMyProfile: vi.fn(),
  uploadMyProfileImage: vi.fn(),
  removeMyProfileImage: vi.fn(),
  getProfileImageSrc: (url: string | null) => url ? `http://localhost:8080${url}` : null,
}));

const profile: UserProfile = {
  userId: 1,
  username: "여행자",
  name: "김여행",
  email: "traveler@example.com",
  role: "USER",
  status: "ACTIVE",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  profileImageUrl: "/api/v1/users/me/profile-image?v=original",
  defaultAvatarColor: "violet",
};

async function renderProfile(value: UserProfile = profile) {
  vi.mocked(fetchMyProfile).mockResolvedValue(value);
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ProfilePage /></MemoryRouter>);
  await screen.findByRole("button", { name: "사진 변경" });
}

function choosePhoto(file: File) {
  fireEvent.change(screen.getByLabelText("프로필 사진 선택"), { target: { files: [file] } });
}

beforeEach(() => {
  vi.resetAllMocks();
});

test.each([
  ["profile.jpg", "image/jpeg"],
  ["profile.png", "image/png"],
  ["profile.webp", "image/webp"],
])("사진 선택 시 바로 업로드하고 저장된 사진을 표시한다: %s", async (filename, type) => {
  const updated = { ...profile, profileImageUrl: "/api/v1/users/me/profile-image?v=new" };
  vi.mocked(uploadMyProfileImage).mockResolvedValue(updated);
  await renderProfile({ ...profile, profileImageUrl: null });
  expect(screen.getByRole("img", { name: "기본 프로필 이미지" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "작성 중인 닉네임" } });

  const file = new File(["photo"], filename, { type });
  Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 });
  choosePhoto(file);

  expect(await screen.findByText("프로필 사진이 변경되었습니다.")).toBeInTheDocument();
  expect(uploadMyProfileImage).toHaveBeenCalledWith(file);
  expect(screen.getByRole("img", { name: "프로필 사진" })).toHaveAttribute("src", `http://localhost:8080${updated.profileImageUrl}`);
  expect(screen.getByLabelText("닉네임")).toHaveValue("작성 중인 닉네임");
  expect(updateMyProfile).not.toHaveBeenCalled();
});

test("지원하지 않는 이미지 형식은 업로드하지 않는다", async () => {
  await renderProfile();

  choosePhoto(new File(["gif"], "profile.gif", { type: "image/gif" }));

  expect(uploadMyProfileImage).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "프로필 사진" })).toHaveAttribute("src", `http://localhost:8080${profile.profileImageUrl}`);
  expect(screen.getByRole("alert")).toHaveTextContent(/(?:JPG|JPEG).*PNG.*WebP/i);
});

test("5MB를 초과하는 사진은 업로드하지 않는다", async () => {
  await renderProfile();
  const file = new File(["photo"], "large.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "size", { value: 5 * 1024 * 1024 + 1 });

  choosePhoto(file);

  expect(uploadMyProfileImage).not.toHaveBeenCalled();
  expect(screen.getByRole("img", { name: "프로필 사진" })).toHaveAttribute("src", `http://localhost:8080${profile.profileImageUrl}`);
  expect(screen.getByRole("alert")).toHaveTextContent(/5\s?MB/i);
});

test("업로드에 실패하면 기존 사진을 유지하고 다시 시도할 수 있다", async () => {
  vi.mocked(uploadMyProfileImage).mockRejectedValue(new Error("사진을 저장하지 못했습니다."));
  await renderProfile();

  choosePhoto(new File(["photo"], "profile.webp", { type: "image/webp" }));

  expect(await screen.findByText("사진을 저장하지 못했습니다.")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "프로필 사진" })).toHaveAttribute("src", `http://localhost:8080${profile.profileImageUrl}`);
  expect(screen.getByRole("button", { name: "사진 변경" })).toBeEnabled();
});

test("업로드한 사진을 제거하면 기본 프로필 이미지로 돌아간다", async () => {
  vi.mocked(removeMyProfileImage).mockResolvedValue({ ...profile, profileImageUrl: null });
  await renderProfile();

  fireEvent.click(screen.getByRole("button", { name: "기본 이미지로 변경" }));

  expect(await screen.findByText("기본 프로필 이미지로 변경되었습니다.")).toBeInTheDocument();
  expect(removeMyProfileImage).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("img", { name: "기본 프로필 이미지" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "기본 이미지로 변경" })).not.toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "프로필 사진" })).not.toBeInTheDocument();
});

test("닉네임과 회원 정보를 저장해도 프로필 사진을 유지한다", async () => {
  vi.mocked(updateMyProfile).mockResolvedValue({ ...profile, username: "새 닉네임", name: null });
  await renderProfile();

  fireEvent.change(screen.getByLabelText("닉네임"), { target: { value: "새 닉네임" } });
  fireEvent.change(screen.getByLabelText("이름"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));

  await waitFor(() => expect(updateMyProfile).toHaveBeenCalledWith({ username: "새 닉네임", name: null, email: profile.email }));
  expect(await screen.findByText("프로필이 저장되었습니다.")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "프로필 사진" })).toHaveAttribute("src", `http://localhost:8080${profile.profileImageUrl}`);
  expect(uploadMyProfileImage).not.toHaveBeenCalled();
  expect(removeMyProfileImage).not.toHaveBeenCalled();
});
