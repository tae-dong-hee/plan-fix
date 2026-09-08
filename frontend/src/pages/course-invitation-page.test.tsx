import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import CourseInvitationPage from "./course-invitation-page";
import { sampleSharingCourse, type CourseSharingPreviewState } from "@/data/course-sharing-preview";
import type { CourseResponse } from "@/services/course";

const course: CourseResponse = {
  ...sampleSharingCourse,
  courseId: 42,
  userId: 7,
  title: "내가 고른 바다 여행",
  description: "지금 보고 있는 코스의 설명이에요.",
  thumbnail: "https://example.com/sea.jpg",
  startDate: "2026-10-02",
  endDate: "2026-10-03",
  days: [
    { dayNumber: 1, spots: [
      { ...sampleSharingCourse.days[0].spots[1], sequence: 2, title: "두 번째 방문지" },
      { ...sampleSharingCourse.days[0].spots[0], sequence: 1, title: "첫 번째 방문지" },
    ] },
    { dayNumber: 2, spots: [] },
  ],
};

function LocationDisplay() {
  const location = useLocation();
  return <span data-testid="current-location">{location.pathname}{location.search}{location.hash}</span>;
}

function renderPage(state?: CourseSharingPreviewState, path = "/invite?preview=1") {
  return render(<MemoryRouter initialEntries={[{ pathname: path.split(/[?#]/)[0], search: path.includes("?") ? `?${path.split("?")[1].split("#")[0]}` : "", hash: path.includes("#") ? `#${path.split("#")[1]}` : "", state }]}><CourseInvitationPage /><LocationDisplay /></MemoryRouter>);
}

describe("CourseInvitationPage frontend preview", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("전달한 현재 코스의 사진, 날짜, 방문 순서를 API 없이 보여준다", () => {
    renderPage({ previewCourse: course, previewPermission: "EDITOR" });
    expect(screen.getByRole("heading", { name: course.title })).toBeInTheDocument();
    expect(screen.getByText(course.description!)).toBeInTheDocument();
    expect(screen.getByText("2026.10.02 ~ 2026.10.03")).toBeInTheDocument();
    expect(screen.getByText("화면 확인용")).toBeInTheDocument();
    expect(screen.queryByText("화면 예시")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: `${course.title} 대표 사진` })).toHaveAttribute("src", course.thumbnail);
    expect(screen.getByRole("img", { name: `${course.title} 대표 사진` })).toHaveAttribute("referrerpolicy", "no-referrer");
    const stops = within(screen.getByRole("list", { name: "Day 1 여행 일정" })).getAllByRole("listitem");
    expect(stops[0]).toHaveTextContent("첫 번째 방문지");
    expect(stops[1]).toHaveTextContent("두 번째 방문지");
    expect(course.days[0].spots[0].title).toBe("두 번째 방문지");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    ["EDITOR", "함께 편집", "초대 수락하고 함께 편집하기"],
    ["VIEWER", "보기 전용", "초대 수락하고 내 코스에 추가"],
  ] as const)("선택한 %s 권한의 화면과 버튼을 유지한다", (permission, label, buttonText) => {
    renderPage({ previewCourse: course, previewPermission: permission });
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: buttonText })).toBeEnabled();
    expect(screen.getByText("실제 초대나 권한 변경은 적용되지 않아요.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("수락 버튼은 화면 확인만 표시하고 API, 저장, 로그인 또는 코스 이동을 하지 않는다", () => {
    const persist = vi.spyOn(Storage.prototype, "setItem");
    renderPage({ previewCourse: course, previewPermission: "EDITOR" });
    const button = screen.getByRole("button", { name: "초대 수락하고 함께 편집하기" });
    fireEvent.click(button);
    expect(screen.getByRole("status")).toHaveTextContent("초대 화면을 확인했어요. 실제 참여는 서버 연동 후 적용돼요.");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByTestId("current-location")).toHaveTextContent("/invite?preview=1");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: course.title })).toBeInTheDocument();
  });

  test.each(["/invite", "/invite?preview=1", "/invite#token=unknown-token"])("주소 %s를 직접 열어도 실제 초대로 오해하지 않게 예시 화면을 보여준다", (path) => {
    renderPage(undefined, path);
    expect(screen.getByText("화면 예시")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: sampleSharingCourse.title })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: `${sampleSharingCourse.title} 대표 사진` })).toHaveAttribute("src", "/travel-guides/random-01.jpg");
    expect(screen.getByRole("list", { name: "Day 1 여행 일정" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("코스 상태 없이 새로 열면 예시를 보여주며 이전 확인 결과는 남기지 않는다", () => {
    const { unmount } = renderPage({ previewCourse: course, previewPermission: "EDITOR" });
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하고 함께 편집하기" }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    unmount();

    renderPage();
    expect(screen.getByText("화면 예시")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: course.title })).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초대 수락하고 내 코스에 추가" })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("코스 상태가 유지된 채 다시 렌더링돼도 실제 참여 완료로 기억하지 않는다", () => {
    const state: CourseSharingPreviewState = { previewCourse: course, previewPermission: "EDITOR" };
    const { unmount } = renderPage(state);
    fireEvent.click(screen.getByRole("button", { name: "초대 수락하고 함께 편집하기" }));
    unmount();
    renderPage(state);
    expect(screen.getByRole("heading", { name: course.title })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "초대 수락하고 함께 편집하기" })).toBeEnabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("잘못된 코스 상태에는 예시를 표시하고 서버에서 복구하려 하지 않는다", () => {
    renderPage({ previewCourse: { ...course, days: null } as unknown as CourseResponse });
    expect(screen.getByText("화면 예시")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: sampleSharingCourse.title })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("대표 사진을 못 불러와도 초대 카드와 일정은 유지한다", () => {
    renderPage({ previewCourse: course, previewPermission: "EDITOR" });
    fireEvent.error(screen.getByRole("img", { name: `${course.title} 대표 사진` }));
    expect(screen.queryByRole("img", { name: `${course.title} 대표 사진` })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: course.title })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Day 1 여행 일정" })).toBeInTheDocument();
  });
});
