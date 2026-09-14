import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CourseDetailPage from "./course-detail-page";
import * as courseService from "@/services/course";
import { UnauthorizedError } from "@/services/spots";

vi.mock("@/services/course");

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
    vi.mocked(courseService.fetchCourse).mockResolvedValue(mockCourse);
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([]);
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

  it("존재하지 않는 코스(null)일 경우 안내 문구를 표시한다", async () => {
    (courseService.fetchCourse as Mock).mockResolvedValue(null);

    renderComponent("999");

    await waitFor(() => {
      expect(screen.getByText("존재하지 않거나 삭제된 코스입니다.")).toBeInTheDocument();
    });
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
    expect(screen.getByRole("button", { name: "카카오톡으로 이동" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "친구 초대" })).not.toBeInTheDocument();
    expect(courseService.createCourseInvite).toHaveBeenCalledExactlyOnceWith("10", "EDITOR");
    expect(writeClipboard).toHaveBeenCalledExactlyOnceWith(mockInvite.inviteUrl);
  });

  it("읽기 권한을 선택하면 VIEWER 권한으로 링크를 생성한다", async () => {
    renderComponent();
    const createButton = await openInviteDialog();
    fireEvent.click(screen.getByRole("button", { name: /읽기 권한/ }));
    fireEvent.click(createButton);

    await screen.findByLabelText("초대 링크");
    expect(courseService.createCourseInvite).toHaveBeenCalledExactlyOnceWith("10", "VIEWER");
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
    expect(screen.queryByRole("button", { name: "카카오톡으로 이동" })).not.toBeInTheDocument();
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
});
