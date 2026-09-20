import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { MemoryRouter } from "react-router-dom";
import CourseListPage from "./course-list-page";
import courseCoverCatalog from "@/constants/course-cover-images.json";
import { getCourseCoverImageSrc } from "@/lib/course-cover-images";
import * as courseService from "@/services/course";

vi.mock("@/services/course");

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCourses: courseService.CourseResponse[] = [
  {
    courseId: 1,
    userId: 1,
    title: "속초 1박 2일 맛집 코스",
    description: "속초 중앙시장과 아바이마을",
    thumbnail: null,
    visibility: "PUBLIC",
    status: "ACTIVE",
    viewCount: 20,
    likeCount: 7,
    startDate: "2026-09-15",
    endDate: "2026-09-16",
    days: [
      { dayNumber: 1, spots: [] },
      { dayNumber: 2, spots: [] },
    ],
    createdAt: "2026-09-02T10:00:00Z",
    updatedAt: "2026-09-02T10:00:00Z",
  },
];

describe("CourseListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <CourseListPage />
      </MemoryRouter>
    );
  };

  it("코스 목록이 비어 있으면 첫 여행 코스 만들기 CTA를 렌더링한다", async () => {
    (courseService.fetchMyCourses as Mock).mockResolvedValue([]);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("생성한 여행 코스가 없습니다.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /첫 여행 코스 만들기/i })).toBeInTheDocument();
    });
  });

  it("코스 목록이 있으면 코스 카드를 렌더링한다", async () => {
    (courseService.fetchMyCourses as Mock).mockResolvedValue(mockCourses);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("속초 1박 2일 맛집 코스")).toBeInTheDocument();
      expect(screen.getByText("속초 중앙시장과 아바이마을")).toBeInTheDocument();
      expect(screen.getByText("1박 2일")).toBeInTheDocument();
    });
  });

  it("코스 카드는 상세 링크를 제공하고 수정·삭제 버튼은 표시하지 않는다", async () => {
    (courseService.fetchMyCourses as Mock).mockResolvedValue(mockCourses);

    renderComponent();

    expect(await screen.findByRole("link", { name: "속초 1박 2일 맛집 코스 코스 상세 보기" })).toHaveAttribute("href", "/courses/1");
    expect(screen.queryByRole("button", { name: "코스 수정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "코스 삭제" })).not.toBeInTheDocument();
  });

  it("저장한 AI 코스의 출처와 선택 테마를 카드 링크 안에서 보여준다", async () => {
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([{
      ...mockCourses[0], generatedBy: "LLM", themes: ["HEALING", "CAFE"],
    }]);

    renderComponent();

    const cardLink = await screen.findByRole("link", { name: "속초 1박 2일 맛집 코스 코스 상세 보기" });
    expect(cardLink).toHaveAttribute("href", "/courses/1");
    expect(cardLink).toHaveTextContent("AI 생성");
    expect(cardLink).toHaveTextContent("힐링·자연");
    expect(cardLink).toHaveTextContent("카페 투어");
  });

  it("생성 정보가 없는 기존 코스는 제목에 AI가 있어도 출처와 테마를 추측하지 않는다", async () => {
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([{
      ...mockCourses[0], title: "속초 힐링자연 AI",
    }]);

    renderComponent();

    await screen.findByRole("heading", { name: "속초 힐링자연 AI" });
    expect(screen.queryByText("AI 생성")).not.toBeInTheDocument();
    expect(screen.queryByText("힐링·자연")).not.toBeInTheDocument();
  });

  it("업로드 사진, 장소 사진, 기본 사진 순으로 시도하고 모두 실패해도 코스 정보를 유지한다", async () => {
    (courseService.fetchMyCourses as Mock).mockResolvedValue([{
      ...mockCourses[0],
      thumbnail: "/course-cover.jpg",
      days: [{
        dayNumber: 1,
        spots: [{
          spotId: 10, sequence: 0, memo: null, title: "속초해변", category: "관광지",
          region: null, sigungu: null, address: null, thumbnail: "/spot-cover.jpg",
          latitude: null, longitude: null,
        }],
      }],
    }]);

    renderComponent();

    const card = await screen.findByTestId("course-item-1");
    expect(card.querySelector("img")).toHaveAttribute("src", "/course-cover.jpg");
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")).toHaveAttribute("src", "/spot-cover.jpg");
    fireEvent.error(card.querySelector("img")!);
    expect(courseCoverCatalog.images.map((image) => getCourseCoverImageSrc(image.url))).toContain(card.querySelector("img")?.getAttribute("src"));
    expect(screen.getByRole("link", { name: "속초 1박 2일 맛집 코스 사진 출처" })).toBeInTheDocument();
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "속초 1박 2일 맛집 코스 사진 출처" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "속초 1박 2일 맛집 코스 코스 상세 보기" })).toHaveAttribute("href", "/courses/1");
    expect(screen.getByText("1개 장소")).toBeInTheDocument();
  });

  it("업로드 사진이 없으면 빈 사진을 건너뛰고 다른 날짜의 장소 사진까지 모두 시도한다", async () => {
    const spot: courseService.CourseSpotSummary = {
      spotId: 10, sequence: 0, memo: null, title: "속초해변", category: "관광지",
      region: null, sigungu: null, address: null, thumbnail: null,
      latitude: null, longitude: null,
    };
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([{
      ...mockCourses[0],
      thumbnail: "  ",
      days: [
        { dayNumber: 1, spots: [spot, { ...spot, spotId: 11, thumbnail: " /first-spot.jpg " }] },
        { dayNumber: 2, spots: [
          { ...spot, spotId: 12, thumbnail: "/first-spot.jpg" },
          { ...spot, spotId: 13, thumbnail: "/second-spot.jpg" },
        ] },
      ],
    }]);

    renderComponent();

    const card = await screen.findByTestId("course-item-1");
    expect(card.querySelector("img")).toHaveAttribute("src", "/first-spot.jpg");
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")).toHaveAttribute("src", "/second-spot.jpg");
    expect(screen.queryByRole("link", { name: "속초 1박 2일 맛집 코스 사진 출처" })).not.toBeInTheDocument();
    fireEvent.error(card.querySelector("img")!);
    expect(courseCoverCatalog.images.map((image) => getCourseCoverImageSrc(image.url))).toContain(card.querySelector("img")?.getAttribute("src"));
  });

  it("업로드와 장소 사진이 모두 없으면 코스마다 다른 기본 사진을 사용한다", async () => {
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([
      mockCourses[0],
      { ...mockCourses[0], courseId: 2, title: "다음 여행 코스" },
    ]);

    const { rerender } = renderComponent();

    const firstCard = await screen.findByTestId("course-item-1");
    const secondCard = screen.getByTestId("course-item-2");
    const firstImage = firstCard.querySelector("img")?.getAttribute("src");
    const secondImage = secondCard.querySelector("img")?.getAttribute("src");
    const catalogSources = courseCoverCatalog.images.map((image) => getCourseCoverImageSrc(image.url));
    expect(catalogSources).toContain(firstImage);
    expect(catalogSources).toContain(secondImage);
    expect(firstImage).not.toBe(secondImage);

    rerender(<MemoryRouter><CourseListPage /></MemoryRouter>);
    expect(firstCard.querySelector("img")).toHaveAttribute("src", firstImage);
    expect(secondCard.querySelector("img")).toHaveAttribute("src", secondImage);
  });

  it("검증된 장소 사진을 대표 사진으로 쓰면 사진 전체와 출처를 표시한다", async () => {
    const source = "https://planfix.cloud/images/verified-spots/526.jpg";
    vi.mocked(courseService.fetchMyCourses).mockResolvedValue([{
      ...mockCourses[0],
      days: [{
        dayNumber: 1,
        spots: [{
          spotId: 526, sequence: 0, memo: null, title: "임당동 성당", category: "관광지",
          region: null, sigungu: null, address: null, thumbnail: source,
          latitude: null, longitude: null,
        }],
      }],
    }]);

    renderComponent();

    const card = await screen.findByTestId("course-item-1");
    const image = card.querySelector("img");
    expect(image).toHaveAttribute("src", source);
    expect(image?.getAttribute("title")).toContain("Trainholic · CC BY-SA 4.0");
    expect(image).toHaveClass("object-contain", "scale-100", "hover:scale-100", "group-hover:scale-100");
    expect(image).not.toHaveClass("object-cover", "group-hover:scale-105");
    expect(screen.getByRole("link", { name: "속초 1박 2일 맛집 코스 사진 출처" })).toHaveAttribute("href", "/image-credits#verified-spot-526");

    fireEvent.error(image!);
    expect(card.querySelector("img")).not.toHaveAttribute("title");
    expect(card.querySelector("img")).toHaveClass("object-cover", "group-hover:scale-105");
    expect(screen.getByRole("link", { name: "속초 1박 2일 맛집 코스 사진 출처" })).not.toHaveAttribute("href", "/image-credits#verified-spot-526");
  });

});
