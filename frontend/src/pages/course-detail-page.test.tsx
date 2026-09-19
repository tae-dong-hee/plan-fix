import { CourseAccessError } from "@/lib/course-errors";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CourseDetailPage from "./course-detail-page";
import * as courseService from "@/services/course";
import { UnauthorizedError } from "@/services/spots";
import { prepareKakaoShare, shareCourseInvite } from "@/lib/kakao-share";

vi.mock("@/services/course");
vi.mock("@/lib/kakao-share", () => ({ prepareKakaoShare: vi.fn(), shareCourseInvite: vi.fn() }));

const mockNavigate = vi.fn();
const writeClipboard = vi.fn();
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCourse: courseService.CourseResponse = {
  courseId: 10,
  userId: 1,
  title: "강릉 바다 여행",
  description: "2박 3일 힐링 코스",
  thumbnail: null,
  visibility: "PUBLIC",
  status: "ACTIVE",
  isOwner: true,
  viewCount: 15,
  likeCount: 5,
  startDate: "2026-09-12",
  endDate: "2026-09-13",
  days: [
    {
      dayNumber: 1,
      spots: [
        {
          spotId: 101,
          sequence: 0,
          memo: "오전 10시 도착",
          title: "경포해변",
          category: "관광지",
          region: "51",
          sigungu: "150",
          address: "강원특별자치도 강릉시 안현동",
          thumbnail: null,
          latitude: null,
          longitude: null,
        },
      ],
    },
    {
      dayNumber: 2,
      spots: [],
    },
  ],
  createdAt: "2026-09-02T10:00:00Z",
  updatedAt: "2026-09-02T10:00:00Z",
};

const mockInvite: courseService.CourseInvite = {
  token: "friend-safe-token",
  inviteUrl: "https://planfix.example/course-invites/friend-safe-token",
  memberRole: "EDITOR",
  expiresAt: "2026-09-20T12:00:00Z",
};

describe("CourseDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prepareKakaoShare).mockResolvedValue();
    vi.mocked(courseService.fetchCourse).mockResolvedValue(mockCourse);
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([]);
    vi.mocked(courseService.fetchDayAccommodations).mockResolvedValue([]);
    vi.mocked(courseService.fetchPendingCourseInvites).mockResolvedValue([]);
    vi.mocked(courseService.createCourseInvite).mockResolvedValue(mockInvite);
    writeClipboard.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: writeClipboard } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  });

  const renderComponent = (courseId = "10") => {
    return render(
      <MemoryRouter initialEntries={[`/courses/${courseId}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/courses/:courseId" element={<CourseDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
  };

  const openInviteDialog = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "친구 초대" }));
    return screen.getByRole("button", { name: "초대 링크 만들기" });
  };

  it("소유권을 확인하기 전에는 내 여행 코스로 표시하거나 관리 정보를 요청하지 않는다", async () => {
    vi.mocked(courseService.fetchCourse).mockReturnValue(new Promise(() => {}));
    renderComponent();

    const breadcrumb = screen.getByRole("navigation", { name: "현재 위치" });
    expect(within(breadcrumb).queryByText("내 여행 코스")).not.toBeInTheDocument();
    expect(within(breadcrumb).getByRole("link", { name: "공개 여행 코스" })).toHaveAttribute("href", "/courses/public");
    expect(screen.getByRole("button", { name: "내 코스" })).not.toHaveAttribute("aria-current");
    expect(courseService.fetchCourseMembers).not.toHaveBeenCalled();
    expect(courseService.fetchDayAccommodations).not.toHaveBeenCalled();
  });

  it.each(["PUBLIC", "PRIVATE"] as const)("본인 코스(%s)는 내 여행 코스 경로와 목록을 유지한다", async (visibility) => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...mockCourse, visibility });
    renderComponent();
    await screen.findByRole("heading", { name: mockCourse.title });

    const breadcrumb = screen.getByRole("navigation", { name: "현재 위치" });
    expect(within(breadcrumb).getByRole("link", { name: "내 여행 코스" })).toHaveAttribute("href", "/courses");
    expect(screen.getByRole("button", { name: "내 코스" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "코스 목록" })).toHaveAttribute("href", "/courses");
    expect(screen.getByRole("link", { name: "코스 수정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코스 삭제" })).toBeInTheDocument();
  });

  it.each([
    ["다른 여행자의 코스", false, false],
    ["소유권 정보가 없는 코스", undefined, undefined],
    ["편집 권한만 있는 코스", false, true],
  ] as const)("%s는 공개 여행 코스로 표시하고 공개 목록으로 돌아간다", async (_label, isOwner, canEdit) => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...mockCourse, isOwner, canEdit });
    renderComponent();
    await screen.findByRole("heading", { name: mockCourse.title });

    const breadcrumb = screen.getByRole("navigation", { name: "현재 위치" });
    expect(within(breadcrumb).getByRole("link", { name: "공개 여행 코스" })).toHaveAttribute("href", "/courses/public");
    expect(within(breadcrumb).queryByText("내 여행 코스")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "코스 목록" })).toHaveAttribute("href", "/courses/public");
    expect(screen.getByRole("button", { name: "내 코스" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "여행" })).toHaveAttribute("aria-current", "page");
    expect(Boolean(screen.queryByRole("link", { name: "코스 수정" }))).toBe(canEdit === true);
    expect(screen.queryByRole("button", { name: "코스 삭제" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "친구 초대" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "멤버 관리" })).not.toBeInTheDocument();
    expect(screen.queryByText("참여 멤버")).not.toBeInTheDocument();
    expect(courseService.fetchCourseMembers).not.toHaveBeenCalled();
    expect(courseService.fetchDayAccommodations).not.toHaveBeenCalled();
  });

  it("코스 정보를 성공적으로 로드하여 Day별 장소를 렌더링한다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue(mockCourse);

    renderComponent();

    expect(screen.getByText(/여행 코스를 불러오는 중입니다/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("강릉 바다 여행")).toBeInTheDocument();
      expect(screen.getByText("2박 3일 힐링 코스")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "경포해변 지도에서 보기" })).toBeInTheDocument();
      expect(screen.getByText(/오전 10시 도착/)).toBeInTheDocument();
    });

    expect(screen.queryByText("아직 계획이 없어요.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("day-theme-1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));
    expect(screen.getByText("아직 계획이 없어요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "경포해변 지도에서 보기" })).not.toBeInTheDocument();
  });

  it("수정 링크와 삭제 버튼이 렌더링되고 삭제 시 확인 후 deleteCourse를 호출한다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue(mockCourse);
    (courseService.deleteCourse as Mock).mockResolvedValue({
      ...mockCourse,
      status: "DELETED",
    });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /코스 수정/i })).toHaveAttribute(
        "href",
        "/courses/10/edit"
      );
      expect(screen.getByRole("button", { name: /코스 삭제/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /코스 삭제/i }));

    expect(confirmSpy).toHaveBeenCalledWith("정말 이 여행 코스를 삭제하시겠습니까?");
    await waitFor(() => {
      expect(courseService.deleteCourse).toHaveBeenCalledWith("10");
      expect(mockNavigate).toHaveBeenCalledWith("/courses", { replace: true });
    });
  });

  it("코스 상세 제목 근처에 저장된 생성 출처와 여행 테마를 표시한다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({
      ...mockCourse, generatedBy: "LLM", themes: ["ACTIVITY", "CULTURE"],
    });

    renderComponent();

    await screen.findByRole("heading", { name: "강릉 바다 여행", level: 1 });
    expect(screen.getByText("AI로 만든 코스")).toBeInTheDocument();
    expect(screen.getByText("액티비티")).toBeInTheDocument();
    expect(screen.getByText("문화·역사")).toBeInTheDocument();
  });

  it("저장된 일차별 테마를 각 날짜 탭과 선택한 일정에 표시한다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({
      ...mockCourse,
      generatedBy: "LLM",
      themes: ["HEALING", "CAFE", "CULTURE", "FOOD"],
      days: [
        { ...mockCourse.days[0], themes: ["HEALING", "CAFE"], tripIdeas: ["COAST_CAFE"] },
        { ...mockCourse.days[1], themes: ["CULTURE", "FOOD"], tripIdeas: ["CULTURE_LOCAL"] },
      ],
    });

    renderComponent();

    expect(await screen.findByRole("tab", { name: "Day 1" })).toHaveAccessibleDescription("바다와 카페");
    expect(screen.getByRole("tab", { name: "Day 2" })).toHaveAccessibleDescription("문화와 골목 여행");
    expect(screen.getByTestId("day-theme-1")).toHaveTextContent("바다와 카페");
    fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));
    expect(screen.getByTestId("day-theme-2")).toHaveTextContent("문화와 골목 여행");
    expect(screen.queryByTestId("day-theme-1")).not.toBeInTheDocument();
  });

  it("존재하지 않는 코스(null)일 경우 안내 문구를 표시한다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue(null);

    renderComponent("999");

    await waitFor(() => {
      expect(screen.getByText("존재하지 않거나 삭제된 코스입니다.")).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "코스 목록으로" })).toHaveAttribute("href", "/courses/public");
  });

  it("편집 멤버에게는 수정만 허용하고 소유자 관리 버튼은 숨긴다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...mockCourse, isOwner: false, canEdit: true });
    renderComponent();
    expect(await screen.findByRole("link", { name: "코스 수정" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "친구 초대" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "코스 삭제" })).not.toBeInTheDocument();
    expect(courseService.fetchDayAccommodations).not.toHaveBeenCalled();
  });

  it("다시 돌아온 탭에서 비공개 전환을 확인하면 이전 제목과 일정을 지운다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValueOnce({ ...mockCourse, isOwner: false })
      .mockRejectedValueOnce(new CourseAccessError());
    renderComponent();
    await screen.findByText(mockCourse.title);
    fireEvent.focus(window);
    expect(await screen.findByText("코스가 비공개로 변경되었거나 접근 권한이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText(mockCourse.title)).not.toBeInTheDocument();
    expect(screen.queryByText("경포해변")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("코스 작성자가 아닌 경우(isOwner가 false) 수정 및 삭제 버튼을 노출하지 않는다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue({
      ...mockCourse,
      isOwner: false,
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("강릉 바다 여행")).toBeInTheDocument();
    });

    expect(screen.queryByRole("link", { name: /코스 수정/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /코스 삭제/i })).not.toBeInTheDocument();
  });

  it("초대 링크 생성 성공은 URL과 직접 열기, 복사 기능을 제공한다", async () => {
    renderComponent();
    fireEvent.click(await openInviteDialog());

    expect(await screen.findByText("초대 링크를 복사했습니다. 친구에게 보내 주세요.")).toBeInTheDocument();
    expect(screen.getByText("초대 링크 준비 완료")).toBeInTheDocument();
    expect(screen.getByLabelText("초대 링크")).toHaveValue(mockInvite.inviteUrl);
    expect(screen.getByLabelText("초대 링크")).toHaveAttribute("readonly");
    expect(screen.getByRole("link", { name: "초대 링크 열기" })).toHaveAttribute("href", mockInvite.inviteUrl);
    expect(screen.getByRole("link", { name: "초대 링크 열기" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "링크 복사" })).toBeEnabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "카카오톡으로 초대" })).toBeEnabled());
    expect(screen.queryByRole("dialog", { name: "친구 초대" })).not.toBeInTheDocument();
    expect(courseService.createCourseInvite).toHaveBeenCalledExactlyOnceWith("10", "EDITOR");
    expect(writeClipboard).toHaveBeenCalledExactlyOnceWith(mockInvite.inviteUrl);
  });

  it("나만 보기 코스는 작성자에게도 초대와 멤버 관리 대신 공개 전환 안내를 표시한다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...mockCourse, visibility: "PRIVATE", isOwner: true });
    vi.mocked(courseService.fetchDayAccommodations).mockResolvedValue([]);
    renderComponent();

    expect(await screen.findByText("나만 보기")).toBeInTheDocument();
    expect(screen.getByText("작성자만 볼 수 있는 코스예요. 친구를 초대하려면 코스 수정에서 전체 공개로 변경해 주세요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "친구 초대" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "멤버 관리" })).not.toBeInTheDocument();
    expect(screen.queryByText("참여 멤버")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "코스 수정" })).toHaveAttribute("href", "/courses/10/edit");
    expect(courseService.createCourseInvite).not.toHaveBeenCalled();
    expect(courseService.fetchCourseMembers).not.toHaveBeenCalled();
  });

  it("읽기 권한을 선택하면 VIEWER 권한으로 링크를 생성한다", async () => {
    vi.mocked(courseService.createCourseInvite).mockResolvedValue({ ...mockInvite, memberRole: "VIEWER" });
    renderComponent();
    const createButton = await openInviteDialog();
    fireEvent.click(screen.getByRole("button", { name: /읽기 권한/ }));
    fireEvent.click(createButton);

    await screen.findByLabelText("초대 링크");
    expect(courseService.createCourseInvite).toHaveBeenCalledExactlyOnceWith("10", "VIEWER");
    await waitFor(() => expect(screen.getByRole("button", { name: "카카오톡으로 초대" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "카카오톡으로 초대" }));
    expect(shareCourseInvite).toHaveBeenCalledExactlyOnceWith({ inviteUrl: mockInvite.inviteUrl, courseTitle: mockCourse.title, memberRole: "VIEWER" });
  });

  it.each([
    "초대 설정이 올바르지 않습니다.",
    "코스 소유자만 초대 링크를 만들 수 있습니다.",
    "서버 오류로 초대 링크를 만들지 못했습니다.",
    "서버에 연결하지 못했습니다.",
  ])("생성 실패는 성공 안내 없이 원인을 표시한다: %s", async (message) => {
    vi.mocked(courseService.createCourseInvite).mockRejectedValue(new Error(message));
    renderComponent();
    fireEvent.click(await openInviteDialog());

    expect(await screen.findByRole("alert")).toHaveTextContent("초대 링크 생성 실패");
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("초대 링크 준비 완료")).not.toBeInTheDocument();
    expect(screen.queryByText("카카오톡을 열고 복사한 링크를 친구에게 보내 주세요.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "카카오톡으로 초대" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("초대 링크")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "초대 링크 열기" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초대 링크 만들기" })).toBeEnabled();
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("인증이 만료된 경우에만 로그인 화면으로 이동한다", async () => {
    vi.mocked(courseService.createCourseInvite).mockRejectedValue(new UnauthorizedError());
    renderComponent();
    fireEvent.click(await openInviteDialog());

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("초대 링크 준비 완료")).not.toBeInTheDocument();
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it("자동 복사 권한이 거부되어도 생성된 링크를 보존하고 재생성 없이 복사할 수 있다", async () => {
    writeClipboard.mockRejectedValueOnce(new DOMException("복사 권한 없음", "NotAllowedError"));
    renderComponent();
    fireEvent.click(await openInviteDialog());

    expect(await screen.findByText("초대 링크는 만들어졌지만 자동 복사를 하지 못했습니다. 아래 링크를 직접 복사해 주세요.")).toBeInTheDocument();
    expect(screen.getByLabelText("초대 링크")).toHaveValue(mockInvite.inviteUrl);
    expect(screen.getByRole("link", { name: "초대 링크 열기" })).toHaveAttribute("href", mockInvite.inviteUrl);
    expect(screen.queryByText("초대 링크 생성 실패")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "친구 초대" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));

    await screen.findByText("초대 링크를 복사했습니다. 친구에게 보내 주세요.");
    expect(writeClipboard).toHaveBeenCalledTimes(2);
    expect(courseService.createCourseInvite).toHaveBeenCalledTimes(1);
  });

  it("클립보드 API가 없는 브라우저에서도 수동 복사할 링크를 제공한다", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    renderComponent();
    fireEvent.click(await openInviteDialog());

    await screen.findByText("초대 링크는 만들어졌지만 자동 복사를 하지 못했습니다. 아래 링크를 직접 복사해 주세요.");
    const input = screen.getByLabelText("초대 링크") as HTMLInputElement;
    expect(input).toHaveValue(mockInvite.inviteUrl);
    fireEvent.focus(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(mockInvite.inviteUrl.length);
    expect(screen.queryByText("초대 링크를 복사했습니다. 친구에게 보내 주세요.")).not.toBeInTheDocument();
    expect(screen.queryByText("초대 링크 생성 실패")).not.toBeInTheDocument();
    expect(courseService.createCourseInvite).toHaveBeenCalledTimes(1);
  });

  it("생성 요청 중 연속 클릭으로 초대 링크를 중복 생성하지 않는다", async () => {
    let finish!: (invite: courseService.CourseInvite) => void;
    vi.mocked(courseService.createCourseInvite).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderComponent();
    const button = await openInviteDialog();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(screen.getByRole("button", { name: "링크 생성 중..." })).toBeDisabled();
    expect(courseService.createCourseInvite).toHaveBeenCalledTimes(1);
    await act(async () => finish(mockInvite));
    expect(screen.getByLabelText("초대 링크")).toHaveValue(mockInvite.inviteUrl);
  });

  it("멤버 관리에서 읽기·편집 권한 변경과 기존 초대 취소가 동작한다", async () => {
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([{ userId: 2, name: "친구", username: "friend", role: "VIEWER", joinedAt: "2026-09-19" }]);
    vi.mocked(courseService.fetchPendingCourseInvites).mockResolvedValue([{ token: mockInvite.token, role: "EDITOR", createdAt: "2026-09-19", expiresAt: mockInvite.expiresAt }]);
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));
    const selector = await screen.findByRole("combobox", { name: "friend 참여 권한" });
    fireEvent.change(selector, { target: { value: "EDITOR" } });
    expect(courseService.updateCourseMemberRole).toHaveBeenCalledWith("10", 2, "EDITOR");
    await waitFor(() => expect(selector).toHaveValue("EDITOR"));
    fireEvent.change(selector, { target: { value: "VIEWER" } });
    await waitFor(() => expect(selector).toHaveValue("VIEWER"));
    expect(courseService.updateCourseMemberRole).toHaveBeenLastCalledWith("10", 2, "VIEWER");
    fireEvent.click(screen.getByRole("button", { name: "초대 취소" }));
    await screen.findByText("사용 가능한 초대 링크가 없습니다.");
    expect(courseService.cancelCourseInvite).toHaveBeenCalledExactlyOnceWith("10", mockInvite.token);
    fireEvent.click(screen.getByRole("button", { name: "friend 멤버 삭제" }));
    await screen.findByText("참여 중인 멤버가 없습니다.");
    expect(courseService.removeCourseMember).toHaveBeenCalledExactlyOnceWith("10", 2);
  });

  it("권한 변경이 실패하면 기존 권한을 유지하고 다시 시도할 수 있다", async () => {
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([{ userId: 2, username: "friend", role: "VIEWER", joinedAt: "2026-09-19" }]);
    vi.mocked(courseService.updateCourseMemberRole).mockRejectedValueOnce(new Error("권한 변경에 실패했습니다."));
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));
    const selector = await screen.findByRole("combobox", { name: "friend 참여 권한" });
    fireEvent.change(selector, { target: { value: "EDITOR" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("권한 변경에 실패했습니다.");
    expect(selector).toHaveValue("VIEWER");
    expect(selector).toBeEnabled();
    fireEvent.change(selector, { target: { value: "EDITOR" } });
    await waitFor(() => expect(selector).toHaveValue("EDITOR"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
