import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import TravelGuideCarousel from "@/components/ui/travel-guide-carousel";

function renderCarousel() {
  render(<MemoryRouter><TravelGuideCarousel locationName="강원도" /></MemoryRouter>);
  const carousel = screen.getByRole("region", { name: "강원도 여행 안내 카드" });
  const previous = screen.getByRole("button", { name: "이전 여행 안내 그림 보기" });
  const next = screen.getByRole("button", { name: "다음 여행 안내 그림 보기" });

  // jsdom has no layout; supply card and viewport measurements so behavior can be exercised.
  Object.defineProperties(carousel, {
    clientWidth: { value: 500, configurable: true },
    scrollWidth: { value: 1000, configurable: true },
    scrollLeft: { value: 0, configurable: true, writable: true },
  });
  carousel.style.columnGap = "16px";
  vi.spyOn(carousel.firstElementChild!, "getBoundingClientRect").mockReturnValue({
    width: 300, height: 176, x: 0, y: 0, top: 0, right: 300, bottom: 176, left: 0,
    toJSON: () => ({}),
  });
  fireEvent.resize(window);
  return { carousel, previous, next };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("arrows move one card including its gap, and scrolling updates availability at either end", () => {
  const { carousel, previous, next } = renderCarousel();
  const scrollBy = vi.fn();
  carousel.scrollBy = scrollBy;

  expect(previous).toBeDisabled();
  expect(next).toBeEnabled();
  fireEvent.click(next);
  expect(scrollBy).toHaveBeenLastCalledWith({ left: 316, behavior: "smooth" });

  carousel.scrollLeft = 316;
  fireEvent.scroll(carousel);
  expect(previous).toBeEnabled();
  fireEvent.click(previous);
  expect(scrollBy).toHaveBeenLastCalledWith({ left: -316, behavior: "smooth" });

  carousel.scrollLeft = 500;
  fireEvent.scroll(carousel);
  expect(previous).toBeEnabled();
  expect(next).toBeDisabled();
  fireEvent.click(next);
  expect(scrollBy).toHaveBeenCalledTimes(2);

  carousel.scrollLeft = 0;
  fireEvent.scroll(carousel);
  expect(previous).toBeDisabled();
  expect(next).toBeEnabled();
});

test("resizing refreshes controls when the cards fit and when they overflow again", () => {
  const { carousel, previous, next } = renderCarousel();
  expect(next).toBeEnabled();

  Object.defineProperty(carousel, "clientWidth", { value: 1000, configurable: true });
  fireEvent.resize(window);
  expect(previous).toBeDisabled();
  expect(next).toBeDisabled();

  Object.defineProperty(carousel, "clientWidth", { value: 500, configurable: true });
  fireEvent.resize(window);
  expect(previous).toBeDisabled();
  expect(next).toBeEnabled();
});

test("the fallback moves cards and immediately refreshes controls without scrollBy", () => {
  const { carousel, previous, next } = renderCarousel();
  Object.defineProperty(carousel, "scrollBy", { value: undefined, configurable: true });

  fireEvent.click(next);
  expect(carousel.scrollLeft).toBe(316);
  expect(previous).toBeEnabled();

  fireEvent.click(previous);
  expect(carousel.scrollLeft).toBe(0);
  expect(previous).toBeDisabled();
  expect(next).toBeEnabled();
});

test("reduced motion preference disables animated scrolling", () => {
  const matchMedia = vi.fn((query: string) => ({ matches: query === "(prefers-reduced-motion: reduce)" }));
  vi.stubGlobal("matchMedia", matchMedia);
  const { carousel, next } = renderCarousel();
  const scrollBy = vi.fn();
  carousel.scrollBy = scrollBy;

  fireEvent.click(next);
  expect(scrollBy).toHaveBeenCalledWith({ left: 316, behavior: "auto" });
});


function FullListDestination() {
  const location = useLocation();
  return <p>목록 주소: {location.pathname}{location.search}</p>;
}

test.each([
  ["강원도", "/travel-guides"],
  ["강릉", "/travel-guides?region=%EA%B0%95%EB%A6%89"],
])("전체보기 opens the correct list for %s", (region, destination) => {
  render(
    <MemoryRouter initialEntries={["/main"]}>
      <Routes>
        <Route path="/main" element={<TravelGuideCarousel locationName={region} />} />
        <Route path="/travel-guides" element={<FullListDestination />} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByRole("link", { name: `${region}에서 뭐 하지? 전체보기` }));
  expect(screen.getByText(`목록 주소: ${destination}`)).toBeInTheDocument();
});
