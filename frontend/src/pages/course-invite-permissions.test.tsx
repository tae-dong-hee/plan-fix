import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CourseDetailPage from "./course-detail-page";
import CourseInvitePage from "./course-invite-page";
import * as courseService from "@/services/course";
import { acceptCourseInvite, fetchCourseInvite } from "@/services/course-invites";

vi.mock("@/services/course");
vi.mock("@/services/course-invites", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/course-invites")>(),
  fetchCourseInvite: vi.fn(),
  acceptCourseInvite: vi.fn(),
}));

const course: courseService.CourseResponse = {
  courseId: 42, userId: 1, title: "함께 떠나는 강릉 여행", description: null, thumbnail: null,
  visibility: "PUBLIC", status: "ACTIVE", isOwner: false, canEdit: false, canViewAccommodations: true,
  viewCount: 1, likeCount: 0, startDate: "2026-09-20", endDate: "2026-09-21",
  days: [
    { dayNumber: 1, spots: [{
      spotId: 101, sequence: 0, memo: "오전 11시 만나요", title: "경포해변", category: "관광지",
      region: null, sigungu: null, address: null, thumbnail: null, latitude: null, longitude: null,
    }] },
    { dayNumber: 2, spots: [] },
  ],
  createdAt: "2026-09-19T00:00:00Z", updatedAt: "2026-09-19T00:00:00Z",
};
const accommodation = { dayNumber: 1, name: "친구들과 묵는 숙소", address: "강릉시 해안로" };

function renderInvite() {
  return render(<MemoryRouter initialEntries={["/course-invites/friend-token"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/course-invites/:token" element={<CourseInvitePage />} />
      <Route path="/courses/:courseId" element={<CourseDetailPage />} />
    </Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchCourseInvite).mockResolvedValue({
    courseId: course.courseId, courseTitle: course.title, memberRole: "VIEWER", expiresAt: "2026-09-22T00:00:00Z",
  });
  vi.mocked(acceptCourseInvite).mockResolvedValue({ courseId: course.courseId, joined: true, alreadyMember: false });
  vi.mocked(courseService.fetchCourse).mockResolvedValue(course);
  vi.mocked(courseService.fetchDayAccommodations).mockResolvedValue([accommodation]);
});

it.each(["VIEWER", "EDITOR"] as const)("%s 초대를 수락하면 일정·메모·숙소를 읽고 지정된 편집 권한만 갖는다", async (memberRole) => {
  vi.mocked(fetchCourseInvite).mockResolvedValue({
    courseId: course.courseId, courseTitle: course.title, memberRole, expiresAt: "2026-09-22T00:00:00Z",
  });
  vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...course, canEdit: memberRole === "EDITOR" });
  renderInvite();
  fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));

  expect(await screen.findByRole("heading", { name: course.title })).toBeInTheDocument();
  expect(await screen.findByText(accommodation.name)).toBeInTheDocument();
  expect(screen.getByText(/오전 11시 만나요/)).toBeInTheDocument();
  expect(Boolean(screen.queryByRole("link", { name: "코스 수정" }))).toBe(memberRole === "EDITOR");
  if (memberRole === "EDITOR") expect(screen.getByRole("link", { name: "코스 수정" })).toHaveAttribute("href", "/courses/42/edit");
  expect(screen.queryByRole("button", { name: "코스 삭제" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "친구 초대" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "멤버 관리" })).not.toBeInTheDocument();
  expect(courseService.fetchCourseMembers).not.toHaveBeenCalled();
  expect(courseService.fetchDayAccommodations).toHaveBeenCalledWith("42");
  expect(acceptCourseInvite).toHaveBeenCalledExactlyOnceWith("friend-token");
  expect(courseService.updateCourse).not.toHaveBeenCalled();
  expect(courseService.saveDayAccommodations).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("tab", { name: "Day 2" }));
  expect(screen.getByText("아직 계획이 없어요.")).toBeInTheDocument();
});

it.each([
  ["EDITOR", false],
  ["VIEWER", true],
] as const)("기존 멤버가 오래된 %s 링크를 수락하면 링크 표시가 아닌 서버의 현재 권한을 사용한다", async (memberRole, canEdit) => {
  vi.mocked(fetchCourseInvite).mockResolvedValue({
    courseId: course.courseId, courseTitle: course.title, memberRole, expiresAt: "2026-09-22T00:00:00Z",
  });
  vi.mocked(acceptCourseInvite).mockResolvedValue({ courseId: course.courseId, joined: false, alreadyMember: true });
  vi.mocked(courseService.fetchCourse).mockResolvedValue({ ...course, canEdit });
  renderInvite();
  fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));
  await screen.findByText(accommodation.name);
  expect(Boolean(screen.queryByRole("link", { name: "코스 수정" }))).toBe(canEdit);
  expect(courseService.fetchCourse).toHaveBeenCalledExactlyOnceWith("42");
  expect(acceptCourseInvite).toHaveBeenCalledExactlyOnceWith("friend-token");
});

it("편집 멤버가 읽기 권한으로 변경되면 다시 돌아온 화면에서 편집을 차단하고 숙소는 유지한다", async () => {
  vi.mocked(courseService.fetchCourse)
    .mockResolvedValueOnce({ ...course, canEdit: true })
    .mockResolvedValueOnce(course);
  renderInvite();
  fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));
  await screen.findByRole("link", { name: "코스 수정" });
  await screen.findByText(accommodation.name);
  fireEvent.focus(window);

  await waitFor(() => expect(screen.queryByRole("link", { name: "코스 수정" })).not.toBeInTheDocument());
  expect(await screen.findByText(accommodation.name)).toBeInTheDocument();
  expect(screen.getByText(/오전 11시 만나요/)).toBeInTheDocument();
});

it("멤버에서 제거되면 공개 일정은 유지하지만 공유 숙소를 지우고 다시 조회하지 않는다", async () => {
  vi.mocked(courseService.fetchCourse)
    .mockResolvedValueOnce(course)
    .mockResolvedValueOnce({ ...course, canViewAccommodations: false });
  renderInvite();
  fireEvent.click(await screen.findByRole("button", { name: "초대 수락하고 참여하기" }));
  await screen.findByText(accommodation.name);
  fireEvent.focus(window);

  await waitFor(() => expect(screen.queryByText(accommodation.name)).not.toBeInTheDocument());
  expect(screen.getByText(/오전 11시 만나요/)).toBeInTheDocument();
  expect(courseService.fetchDayAccommodations).toHaveBeenCalledTimes(1);
});
