import { CourseAccessError } from "@/lib/course-errors";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe("CourseDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(prepareKakaoShare).mockResolvedValue();
    vi.mocked(courseService.fetchCourse).mockResolvedValue(mockCourse);
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([]);
    vi.mocked(courseService.fetchDayAccommodations).mockResolvedValue([]);
    vi.mocked(courseService.fetchPendingCourseInvites).mockResolvedValue([]);
    vi.mocked(courseService.createCourseInvite).mockResolvedValue(mockInvite);
    vi.mocked(courseService.importCourseDays).mockResolvedValue({ ...mockCourse, courseId: 99, isOwner: true });
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
        <Link to="/courses/20">다른 코스 열기</Link>
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

  it("다른 여행자의 코스는 일차를 골라 내 코스로 가져올 수 있다", async () => {
    vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...mockCourse, isOwner: false, canEdit: false });
    renderComponent();

    fireEvent.click(await screen.findByRole("button", { name: "코스 가져오기" }));
    const dialog = screen.getByRole("dialog", { name: "코스 가져오기" });
    expect(within(dialog).getByRole("checkbox", { name: "Day 1 일정 선택" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Day 2 일정 선택" })).toBeChecked();
    expect(within(dialog).getByText("1박 2일")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Day 2 일정 선택" }));
    expect(within(dialog).getByText("당일치기 여행")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "선택한 1일 가져오기" }));

    await waitFor(() => expect(courseService.importCourseDays).toHaveBeenCalledExactlyOnceWith("10", [1]));
    expect(mockNavigate).toHaveBeenCalledWith("/courses/99");
  });

  it("본인 코스에는 기존 새 코스 만들기 버튼을 유지한다", async () => {
    renderComponent();
    expect(await screen.findByRole("link", { name: "새 코스 만들기" })).toHaveAttribute("href", "/courses/create");
    expect(screen.queryByRole("button", { name: "코스 가져오기" })).not.toBeInTheDocument();
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

  it("카카오톡 공유를 다시 열고 링크를 복사해도 초대 링크를 추가 생성하지 않는다", async () => {
    renderComponent();
    fireEvent.click(await openInviteDialog());
    const kakaoButton = await screen.findByRole("button", { name: "카카오톡으로 초대" });
    await waitFor(() => expect(kakaoButton).toBeEnabled());
    fireEvent.click(kakaoButton);
    fireEvent.click(kakaoButton);
    fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));

    await waitFor(() => expect(writeClipboard).toHaveBeenCalledTimes(2));
    expect(courseService.createCourseInvite).toHaveBeenCalledExactlyOnceWith("10", "EDITOR");
    expect(shareCourseInvite).toHaveBeenCalledTimes(2);
    expect(vi.mocked(shareCourseInvite).mock.calls.every(([invite]) => invite.inviteUrl === mockInvite.inviteUrl)).toBe(true);
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

  it("같은 권한의 기존 링크가 여러 개여도 한 그룹에서 개수와 발급 시각을 보여준다", async () => {
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([{ userId: 2, username: "friend", role: "EDITOR", joinedAt: "2026-09-19" }]);
    const invites = ["2026-09-19T12:00:00Z", "2026-09-19T11:00:00Z", "2026-09-19T10:00:00Z"].map((createdAt, index) => ({
      token: `existing-${index}`, role: "EDITOR" as const, createdAt, expiresAt: mockInvite.expiresAt,
    }));
    vi.mocked(courseService.fetchPendingCourseInvites).mockResolvedValue(invites);
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));

    const group = await screen.findByText("편집 초대 링크 · 3개");
    expect(screen.getAllByRole("combobox", { name: "friend 참여 권한" })).toHaveLength(1);
    expect(screen.getByText(/공유 가능한 링크는 3개예요/)).toBeInTheDocument();
    const details = group.closest("details")!;
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(group);
    await waitFor(() => expect(details).toHaveAttribute("open"));
    expect(within(details).getAllByRole("button", { name: "다시 공유" })).toHaveLength(3);
    expect(Array.from(details.querySelectorAll("time")).map((time) => time.dateTime)).toEqual(invites.flatMap((invite) => [invite.createdAt, invite.expiresAt]));
    fireEvent.click(within(details).getAllByRole("button", { name: "초대 취소" })[1]);
    await screen.findByText("편집 초대 링크 · 2개");
    expect(courseService.cancelCourseInvite).toHaveBeenCalledExactlyOnceWith("10", "existing-1");
  });

  it("멤버 관리의 기존 링크를 새로 생성하지 않고 복사와 카카오톡으로 다시 공유한다", async () => {
    vi.mocked(courseService.fetchPendingCourseInvites).mockResolvedValue([{ token: mockInvite.token, role: "VIEWER", createdAt: "2026-09-19T12:00:00Z", expiresAt: mockInvite.expiresAt }]);
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));
    fireEvent.click(await screen.findByRole("button", { name: "다시 공유" }));

    const inviteUrl = `${window.location.origin}/course-invites/${mockInvite.token}`;
    expect(await screen.findByLabelText("초대 링크")).toHaveValue(inviteUrl);
    expect(screen.queryByRole("dialog", { name: "멤버 및 초대 관리" })).not.toBeInTheDocument();
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledExactlyOnceWith(inviteUrl));
    const kakaoButton = screen.getByRole("button", { name: "카카오톡으로 초대" });
    await waitFor(() => expect(kakaoButton).toBeEnabled());
    fireEvent.click(kakaoButton);
    expect(shareCourseInvite).toHaveBeenCalledExactlyOnceWith({ inviteUrl, courseTitle: mockCourse.title, memberRole: "VIEWER" });
    expect(courseService.createCourseInvite).not.toHaveBeenCalled();
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

  it.each(["권한 변경", "멤버 회수"])("%s 이후 늦은 초기 멤버 조회가 이전 권한을 복원하지 않는다", async (action) => {
    const member: courseService.CourseMember = { userId: 2, username: "friend", role: "EDITOR", joinedAt: "2026-09-19" };
    const oldRequest = deferred<courseService.CourseMember[]>();
    vi.mocked(courseService.fetchCourseMembers).mockReturnValueOnce(oldRequest.promise).mockResolvedValue([member]);
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));
    const selector = await screen.findByRole("combobox", { name: "friend 참여 권한" });
    if (action === "권한 변경") {
      fireEvent.change(selector, { target: { value: "VIEWER" } });
      await waitFor(() => expect(selector).toHaveValue("VIEWER"));
    } else {
      fireEvent.click(screen.getByRole("button", { name: "friend 멤버 삭제" }));
      await screen.findByText("참여 중인 멤버가 없습니다.");
    }
    await act(async () => oldRequest.resolve([member]));
    if (action === "권한 변경") expect(screen.getByRole("combobox", { name: "friend 참여 권한" })).toHaveValue("VIEWER");
    else expect(screen.queryByRole("combobox", { name: "friend 참여 권한" })).not.toBeInTheDocument();
  });

  it.each(["멤버 회수", "초대 취소"])("%s 실패는 기존 목록을 보존하고 재시도로 완료한다", async (action) => {
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([{ userId: 2, username: "friend", role: "EDITOR", joinedAt: "2026-09-19" }]);
    vi.mocked(courseService.fetchPendingCourseInvites).mockResolvedValue([{ token: mockInvite.token, role: "EDITOR", createdAt: "2026-09-19", expiresAt: mockInvite.expiresAt }]);
    const mutation = action === "멤버 회수" ? courseService.removeCourseMember : courseService.cancelCourseInvite;
    vi.mocked(mutation).mockRejectedValueOnce(new Error("저장에 실패했습니다."));
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));
    const button = await screen.findByRole("button", { name: action === "멤버 회수" ? "friend 멤버 삭제" : "초대 취소" });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("저장에 실패했습니다.");
    expect(button).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "friend 참여 권한" })).toHaveValue("EDITOR");
    expect(screen.getByRole("button", { name: "초대 취소" })).toBeInTheDocument();
    fireEvent.click(button);
    await screen.findByText(action === "멤버 회수" ? "참여 중인 멤버가 없습니다." : "사용 가능한 초대 링크가 없습니다.");
    expect(mutation).toHaveBeenCalledTimes(2);
    // 링크 취소는 기존 멤버를 제거하지 않고, 멤버 회수는 다른 사람에게 보낼 링크를 삭제하지 않는다.
    if (action === "멤버 회수") expect(screen.getByRole("button", { name: "초대 취소" })).toBeInTheDocument();
    else expect(screen.getByRole("combobox", { name: "friend 참여 권한" })).toHaveValue("EDITOR");
  });

  it("권한 변경 중 중복 변경·회수를 막고 관리창을 다시 열어도 늦은 조회와 경합하지 않는다", async () => {
    const change = deferred<void>();
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([{ userId: 2, username: "friend", role: "EDITOR", joinedAt: "2026-09-19" }]);
    vi.mocked(courseService.updateCourseMemberRole).mockReturnValue(change.promise);
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));
    const selector = await screen.findByRole("combobox", { name: "friend 참여 권한" });
    fireEvent.change(selector, { target: { value: "VIEWER" } });
    fireEvent.change(selector, { target: { value: "VIEWER" } });
    fireEvent.click(screen.getByRole("button", { name: "friend 멤버 삭제" }));
    expect(selector).toBeDisabled();
    expect(courseService.updateCourseMemberRole).toHaveBeenCalledExactlyOnceWith("10", 2, "VIEWER");
    expect(courseService.removeCourseMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "멤버 관리" }));
    expect(screen.getByRole("combobox", { name: "friend 참여 권한" })).toBeDisabled();
    expect(courseService.fetchCourseMembers).toHaveBeenCalledTimes(2);
    await act(async () => change.resolve());
    expect(screen.getByRole("combobox", { name: "friend 참여 권한" })).toHaveValue("VIEWER");
    expect(screen.getByRole("combobox", { name: "friend 참여 권한" })).toBeEnabled();
  });

  it("멤버 관리 요청에서 인증이 만료되면 목록을 유지하며 로그인으로 이동한다", async () => {
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([{ userId: 2, username: "friend", role: "EDITOR", joinedAt: "2026-09-19" }]);
    vi.mocked(courseService.removeCourseMember).mockRejectedValue(new UnauthorizedError());
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));
    fireEvent.click(await screen.findByRole("button", { name: "friend 멤버 삭제" }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/login"));
    expect(screen.getByRole("combobox", { name: "friend 참여 권한" })).toHaveValue("EDITOR");
  });

  it("다른 코스로 이동하면 이전 관리창과 늦은 초대 생성 성공을 무시한다", async () => {
    const creating = deferred<courseService.CourseInvite>();
    vi.mocked(courseService.createCourseInvite).mockReturnValue(creating.promise);
    vi.mocked(courseService.fetchCourse).mockResolvedValueOnce(mockCourse).mockResolvedValue({ ...mockCourse, courseId: 20, title: "새 여행" });
    renderComponent();
    fireEvent.click(await openInviteDialog());
    fireEvent.click(screen.getByRole("link", { name: "다른 코스 열기" }));
    await screen.findByRole("heading", { name: "새 여행" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => creating.resolve(mockInvite));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("다른 코스로 이동한 뒤 이전 권한 변경 인증 오류가 새 화면을 이동시키지 않는다", async () => {
    const changing = deferred<void>();
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([{ userId: 2, username: "friend", role: "EDITOR", joinedAt: "2026-09-19" }]);
    vi.mocked(courseService.updateCourseMemberRole).mockReturnValue(changing.promise);
    vi.mocked(courseService.fetchCourse).mockResolvedValueOnce(mockCourse).mockResolvedValue({ ...mockCourse, courseId: 20, title: "새 여행" });
    renderComponent();
    fireEvent.click(await screen.findByRole("button", { name: "멤버 관리" }));
    fireEvent.change(await screen.findByRole("combobox", { name: "friend 참여 권한" }), { target: { value: "VIEWER" } });
    fireEvent.click(screen.getByRole("link", { name: "다른 코스 열기" }));
    await screen.findByRole("heading", { name: "새 여행" });
    await act(async () => changing.reject(new UnauthorizedError()));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
