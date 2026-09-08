import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import TravelGuidesPage from "@/pages/travel-guides-page";
import { guideCards } from "@/data/travel-guides";

vi.mock("@/components/ui/app-nav", () => ({ default: () => null }));

function renderPage(initialUrl = "/travel-guides") {
  return render(
    <MemoryRouter
      initialEntries={[initialUrl]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/travel-guides" element={<TravelGuidesPage />} />
        <Route path="/main" element={<h1>메인 화면</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TravelGuidesPage", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("shows every guide, including sample cards, in the full list", () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "강원도에서 뭐 하지?" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "강원도 여행 안내 전체 목록" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(guideCards.length);
    expect(screen.getByText(/총/)).toHaveTextContent(`총 ${guideCards.length}개의 여행 안내`);

    for (const card of guideCards) {
      expect(within(list).getByRole("heading", {
        name: (name) => name.replace(/\s+/g, " ") === card.getTitle("강원도").replace(/\s+/g, " "),
      })).toBeInTheDocument();
    }
    expect(within(list).getAllByText("샘플")).toHaveLength(guideCards.filter((card) => card.isSample).length);
  });

  test("carries the selected region into the page and card titles", () => {
    renderPage("/travel-guides?region=속초");

    expect(screen.getByRole("heading", { level: 1, name: "속초에서 뭐 하지?" })).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "속초 여행 안내 전체 목록" });
    for (const card of guideCards) {
      expect(within(list).getByRole("heading", {
        name: (name) => name.replace(/\s+/g, " ") === card.getTitle("속초").replace(/\s+/g, " "),
      })).toBeInTheDocument();
    }
  });

  test.each(["없는지역", "toString", "__proto__"])("uses Gangwon for an unknown region: %s", (region) => {
    renderPage(`/travel-guides?region=${encodeURIComponent(region)}`);

    expect(screen.getByRole("heading", { level: 1, name: "강원도에서 뭐 하지?" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "강원도 여행 안내 전체 목록" })).toBeInTheDocument();
  });

  test("opens at the top and returns to the main screen with the back button", () => {
    renderPage();

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
    fireEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(screen.getByRole("heading", { name: "메인 화면" })).toBeInTheDocument();
  });
});
