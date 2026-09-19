import { act, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";

import ImageCreditsPage from "@/pages/image-credits-page";

const scrollIntoView = vi.fn();
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

function renderNavigation() {
  return render(
    <MemoryRouter initialEntries={["/start"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Link to="/image-credits#verified-spot-526">성당 사진 출처</Link>
      <Link to="/image-credits#verified-spot-528">당간지주 사진 출처</Link>
      <Link to="/start">돌아가기</Link>
      <Routes>
        <Route path="/start" element={<div>장소 정보</div>} />
        <Route path="/image-credits" element={<ImageCreditsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function nextFrame() {
  act(() => vi.advanceTimersByTime(20));
}

test("scrolls to the linked credit after rendering, including repeated visits to the same anchor", () => {
  renderNavigation();
  fireEvent.click(screen.getByRole("link", { name: "성당 사진 출처" }));
  expect(screen.getByRole("heading", { name: "사진 출처" })).toBeInTheDocument();
  expect(scrollIntoView).not.toHaveBeenCalled();

  nextFrame();
  expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
  expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("verified-spot-526"));

  fireEvent.click(screen.getByRole("link", { name: "성당 사진 출처" }));
  nextFrame();
  expect(scrollIntoView).toHaveBeenCalledTimes(2);
  expect(scrollIntoView.mock.contexts[1]).toBe(document.getElementById("verified-spot-526"));
});

test("a new destination replaces pending scrolling and leaving the page cancels it", () => {
  renderNavigation();
  fireEvent.click(screen.getByRole("link", { name: "성당 사진 출처" }));
  fireEvent.click(screen.getByRole("link", { name: "당간지주 사진 출처" }));
  nextFrame();
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
  expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("verified-spot-528"));

  fireEvent.click(screen.getByRole("link", { name: "성당 사진 출처" }));
  fireEvent.click(screen.getByRole("link", { name: "돌아가기" }));
  nextFrame();
  expect(scrollIntoView).toHaveBeenCalledTimes(1);
});
