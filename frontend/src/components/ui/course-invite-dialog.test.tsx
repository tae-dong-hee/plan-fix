import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CourseInviteShareDialog } from "./course-invite-dialog";
import { prepareKakaoShare, shareCourseInvite } from "@/lib/kakao-share";

vi.mock("@/lib/kakao-share", () => ({ prepareKakaoShare: vi.fn(), shareCourseInvite: vi.fn() }));

const inviteUrl = "https://planfix.cloud/course-invites/friend-token";
const onCopy = vi.fn();
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
function show(memberRole: "VIEWER" | "EDITOR" = "EDITOR") {
  return render(<CourseInviteShareDialog inviteUrl={inviteUrl} courseTitle="강릉 바다 여행" memberRole={memberRole} message="초대 링크를 만들었습니다." copied={false} copying={false} onCopy={onCopy} onClose={vi.fn()} />);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prepareKakaoShare).mockResolvedValue();
  Reflect.deleteProperty(navigator, "share");
});
afterEach(() => {
  if (originalShare) Object.defineProperty(navigator, "share", originalShare);
  else Reflect.deleteProperty(navigator, "share");
});

it.each(["VIEWER", "EDITOR"] as const)("%s 초대의 링크와 권한을 카카오톡 친구 선택 화면에 전달한다", async (memberRole) => {
  show(memberRole);
  const button = screen.getByRole("button", { name: "카카오톡으로 초대" });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  expect(shareCourseInvite).toHaveBeenCalledExactlyOnceWith({ inviteUrl, courseTitle: "강릉 바다 여행", memberRole });
  expect(screen.getByText("카카오톡에서 친구나 채팅방을 선택해 초대를 보내 주세요.")).toBeInTheDocument();
  expect(onCopy).not.toHaveBeenCalled();
});

it("SDK 준비 중 팝업 호출을 막고 준비가 끝난 후에만 공유한다", async () => {
  let finish!: () => void;
  vi.mocked(prepareKakaoShare).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  show();
  const button = screen.getByRole("button", { name: "카카오톡으로 초대" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(shareCourseInvite).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(button).toBeEnabled();
});

it("카카오 로딩 실패에도 링크 복사와 재시도를 제공한다", async () => {
  vi.mocked(prepareKakaoShare).mockRejectedValueOnce(new Error("카카오톡 공유를 불러오지 못했습니다."));
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent("카카오톡 공유를 불러오지 못했습니다.");
  expect(screen.getByLabelText("초대 링크")).toHaveValue(inviteUrl);
  fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
  expect(onCopy).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "카카오톡 공유 다시 준비" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "카카오톡으로 초대" })).toBeEnabled());
  expect(prepareKakaoShare).toHaveBeenCalledTimes(2);
});

it("공유 호출 오류를 표시하면서 생성된 초대 링크를 보존한다", async () => {
  vi.mocked(shareCourseInvite).mockImplementation(() => { throw new Error("공유 창을 열지 못했습니다."); });
  show();
  await waitFor(() => expect(screen.getByRole("button", { name: "카카오톡으로 초대" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "카카오톡으로 초대" }));
  expect(screen.getByRole("alert")).toHaveTextContent("공유 창을 열지 못했습니다.");
  expect(screen.getByLabelText("초대 링크")).toHaveValue(inviteUrl);
  expect(screen.queryByText("카카오톡에서 친구나 채팅방을 선택해 초대를 보내 주세요.")).not.toBeInTheDocument();
});

it("브라우저 공유에는 같은 초대 URL을 넘기고 취소를 오류로 표시하지 않는다", async () => {
  const share = vi.fn().mockRejectedValue(new DOMException("취소", "AbortError"));
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  show("VIEWER");
  await waitFor(() => expect(screen.getByRole("button", { name: "카카오톡으로 초대" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "다른 앱으로 링크 공유" }));
  expect(share).toHaveBeenCalledExactlyOnceWith({ title: "강릉 바다 여행 · PlanFix 친구 초대", text: "읽기 권한으로 여행에 함께해요.", url: inviteUrl });
  await waitFor(() => expect(screen.getByRole("button", { name: "다른 앱으로 링크 공유" })).toBeEnabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByText(/링크 공유를 열지 못했습니다/)).not.toBeInTheDocument();
});

it("브라우저 공유 실패에도 링크 복사를 사용할 수 있다", async () => {
  Object.defineProperty(navigator, "share", { configurable: true, value: vi.fn().mockRejectedValue(new Error("denied")) });
  show();
  fireEvent.click(screen.getByRole("button", { name: "다른 앱으로 링크 공유" }));
  expect(await screen.findByText("링크 공유를 열지 못했습니다. 링크를 복사해 친구에게 보내 주세요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "링크 복사" })).toBeEnabled();
});
