import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CourseShareModal from "./course-share-modal";
import type { CourseResponse } from "@/services/course";

const course: CourseResponse = {
  courseId: 12, userId: 3, title: "강릉 바다 여행", description: null, thumbnail: "/travel-guides/random-01.jpg", visibility: "PUBLIC", status: "ACTIVE", viewCount: 0, likeCount: 0, startDate: "2026-09-12", endDate: "2026-09-12", days: [{ dayNumber: 1, spots: [] }], createdAt: "2026-09-09T00:00:00Z", updatedAt: "2026-09-09T00:00:00Z", isOwner: true,
};
const clipboard = vi.fn();
const fetchMock = vi.fn();
let clipboardDescriptor: PropertyDescriptor | undefined;
let shareDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VITE_API_BASE_URL", "http://localhost:8080/api/v1");
  vi.stubEnv("VITE_PUBLIC_APP_URL", "https://travel.example.com");
  vi.stubGlobal("fetch", fetchMock);
  clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  shareDescriptor = Object.getOwnPropertyDescriptor(navigator, "share");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard.mockResolvedValue(undefined) } });
});
afterEach(() => {
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
  if (shareDescriptor) Object.defineProperty(navigator, "share", shareDescriptor);
  else Reflect.deleteProperty(navigator, "share");
});

function showModal(visibility: "PUBLIC" | "PRIVATE" = "PUBLIC", onClose = vi.fn()) {
  return render(<MemoryRouter><CourseShareModal course={{ ...course, visibility }} onClose={onClose} /></MemoryRouter>);
}

function PreviewDestination() {
  const location = useLocation();
  return <output data-testid="preview-destination">{JSON.stringify({ search: location.search, ...location.state })}</output>;
}

describe("CourseShareModal UI", () => {
  it("renders both permissions and sharing immediately without calling a configured backend", () => {
    showModal();
    expect(screen.getByRole("dialog", { name: "친구 초대" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "보기만" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "함께 편집" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "링크 복사" })).toBeEnabled();
    expect(screen.getByText("초대와 권한 변경은 서버 연동 후 적용돼요.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "함께하는 친구" })).toHaveTextContent("함께 여행할 친구를 초대해 보세요.");
    expect(screen.queryByText(/준비 중/)).not.toBeInTheDocument();
  });

  it("copies the existing course URL only on a click and does not grant selected edit access", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    showModal();
    fireEvent.click(screen.getByRole("radio", { name: "함께 편집" }));
    expect(screen.getByRole("radio", { name: "함께 편집" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "공유 링크" })).toHaveValue("https://travel.example.com/courses/12");
    expect(clipboard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
    await screen.findByText("코스 링크를 복사했어요.");
    expect(clipboard).toHaveBeenCalledExactlyOnceWith("https://travel.example.com/courses/12");
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it.each(["VIEWER", "EDITOR"] as const)("passes the selected %s permission and current course to the same-browser preview", (permission) => {
    const onClose = vi.fn();
    render(<MemoryRouter initialEntries={["/courses/12"]}><Routes><Route path="/courses/12" element={<CourseShareModal course={course} onClose={onClose} />} /><Route path="/invite" element={<PreviewDestination />} /></Routes></MemoryRouter>);
    if (permission === "EDITOR") fireEvent.click(screen.getByRole("radio", { name: "함께 편집" }));
    fireEvent.click(screen.getByRole("link", { name: "초대 화면 보기" }));
    expect(JSON.parse(screen.getByTestId("preview-destination").textContent || "{}")).toEqual({ search: "?preview=1", previewCourse: course, previewPermission: permission });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows private-course and localhost access limits without disabling preview controls", () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "http://localhost:3000");
    showModal("PRIVATE");
    expect(screen.getByText("비공개 코스는 현재 작성자만 볼 수 있어요.")).toBeInTheDocument();
    expect(screen.getByText(/이 주소는 현재 컴퓨터에서만/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "공유 링크" })).toHaveValue("http://localhost:3000/courses/12");
    expect(screen.getByRole("radio", { name: "함께 편집" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "초대 화면 보기" })).toHaveAttribute("href", "/invite?preview=1");
  });

  it("selects the address for manual copy when clipboard access fails", async () => {
    clipboard.mockRejectedValue(new Error("denied"));
    showModal();
    fireEvent.click(screen.getByRole("button", { name: "링크 복사" }));
    await screen.findByText(/아래 주소를 길게 누르거나/);
    const input = screen.getByRole("textbox", { name: "공유 링크" }) as HTMLInputElement;
    expect(input).toHaveFocus();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("opens the native share sheet only after the share button is clicked", () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    showModal();
    expect(share).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    expect(share).toHaveBeenCalledExactlyOnceWith({ title: course.title, text: "강릉 바다 여행 코스를 확인해 보세요.", url: "https://travel.example.com/courses/12" });
  });

  it("traps keyboard focus, closes with Escape and restores the trigger and scrolling", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = showModal("PUBLIC", onClose);
    expect(document.body.style.overflow).toBe("hidden");
    const close = screen.getByRole("button", { name: "친구 초대 닫기" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("link", { name: "초대 화면 보기" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
