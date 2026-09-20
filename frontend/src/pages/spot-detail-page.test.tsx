import { StrictMode } from "react";
import type { MockedFunction } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import SpotDetailPage from "@/pages/spot-detail-page";
import { FALLBACK_SPOT_IMAGE } from "@/components/ui/spot-image";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";
import { fetchSpotDetail, likeSpot, unlikeSpot, UnauthorizedError, type SpotDetail } from "@/services/spots";

vi.mock("@/services/spots");

const mockedFetchSpotDetail = fetchSpotDetail as MockedFunction<typeof fetchSpotDetail>;
const mockedLikeSpot = likeSpot as MockedFunction<typeof likeSpot>;
const mockedUnlikeSpot = unlikeSpot as MockedFunction<typeof unlikeSpot>;

function renderAt(spotId: string, { strict = false }: { strict?: boolean } = {}) {
  const tree = (
    <MemoryRouter
      initialEntries={[`/spots/${spotId}`]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/spots/:spotId" element={<SpotDetailPage />} />
        <Route path="/login" element={<div>로그인 페이지</div>} />
      </Routes>
    </MemoryRouter>
  );

  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

test("follows the displayed photo's credit through failures and gallery navigation", async () => {
  mockedFetchSpotDetail.mockResolvedValue({
    spotId: 526,
    title: "임당동 성당",
    category: "관광지",
    region: "51",
    sigungu: "150",
    address: "강원특별자치도 강릉시 임영로 148",
    latitude: null,
    longitude: null,
    thumbnail: "https://planfix.cloud/images/verified-spots/526.jpg",
    description: null,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    images: ["https://example.com/another-photo.jpg"],
    info: null,
    isLiked: false,
  });

  renderAt("526");
  const credit = await screen.findByRole("link", { name: "사진 출처" });
  expect(credit).toHaveAttribute("href", "/image-credits#verified-spot-526");
  expect(credit.parentElement?.closest("a, button")).toBeNull();

  const representative = screen.getByRole("img", { name: "임당동 성당" });
  fireEvent.error(representative);
  expect(representative).toHaveAccessibleName(/임당동 성당 유사 이미지:/);
  expect(screen.queryByRole("link", { name: "사진 출처" })).not.toBeInTheDocument();
  expect(screen.queryByText(/사진: Trainholic/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "유사 이미지 출처" })).toHaveAttribute("href", "/image-credits#similar-images");

  fireEvent.error(representative);
  expect(representative).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
  expect(screen.queryByRole("link", { name: /사진 출처|유사 이미지 출처/ })).not.toBeInTheDocument();
  expect(screen.queryByText("‘유사 이미지’는 실제 장소 사진이 아닙니다.")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "다음 사진" }));
  expect(screen.queryByRole("link", { name: "사진 출처" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "유사 이미지 출처" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "이전 사진" }));
  expect(screen.getByRole("img", { name: "임당동 성당" })).toHaveAttribute("src", "https://planfix.cloud/images/verified-spots/526.jpg");
  expect(screen.getByRole("link", { name: "사진 출처" })).toHaveAttribute("href", "/image-credits#verified-spot-526");
});

afterEach(() => {
  mockedFetchSpotDetail.mockReset();
});

test("shows a loading status while the detail is being fetched", () => {
  mockedFetchSpotDetail.mockReturnValue(new Promise(() => {}));

  renderAt("1");

  expect(screen.getByRole("status", { name: "장소 정보를 불러오는 중..." })).toBeInTheDocument();
});

test("calls fetchSpotDetail only once per spot even under StrictMode's dev-mode double effect invocation", async () => {
  // 상세 조회는 호출될 때마다 서버의 조회수를 올리는 부작용이 있다. React.StrictMode는
  // 개발 모드에서 effect를 마운트→클린업→재마운트로 일부러 두 번 실행하는데, 이때 매번
  // fetch를 새로 호출하면 화면 한 번 들어왔는데 조회수가 2씩 올라간다(실제로 겪은 버그).
  mockedFetchSpotDetail.mockResolvedValue({
    spotId: 1,
    title: "정동진",
    category: "관광지",
    region: null,
    sigungu: null,
    address: null,
    latitude: null,
    longitude: null,
    thumbnail: null,
    description: null,
    viewCount: 1,
    likeCount: 0,
    commentCount: 0,
    images: [],
    info: null,
    isLiked: false,
  });

  renderAt("1", { strict: true });

  await screen.findByRole("heading", { name: "정동진" });
  expect(mockedFetchSpotDetail).toHaveBeenCalledTimes(1);
});

test("renders the spot detail once it loads", async () => {
  mockedFetchSpotDetail.mockResolvedValue({
    spotId: 1,
    title: "정동진",
    category: "관광지",
    region: "51",
    sigungu: "150",
    address: "강원특별자치도 강릉시",
    latitude: 37.1,
    longitude: 129.0,
    thumbnail: "https://example.com/thumb.jpg",
    description: "동해안의 대표 해변",
    viewCount: 11,
    likeCount: 3,
    commentCount: 1,
    images: [],
    info: null,
    isLiked: false,
  });

  renderAt("1");

  expect(await screen.findByRole("heading", { name: "정동진" })).toBeInTheDocument();
  expect(screen.getByText("관광지")).toBeInTheDocument();
  expect(screen.getByText("강원특별자치도 강릉시")).toBeInTheDocument();
  expect(screen.getByText("동해안의 대표 해변")).toBeInTheDocument();
  expect(screen.getByText("좋아요 3")).toBeInTheDocument();
  expect(screen.getByText("조회수 11")).toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "현재 사진" })).not.toBeInTheDocument();
  expect(screen.queryByText("주소 정보가 등록되지 않은 장소예요.")).not.toBeInTheDocument();
  expect(screen.queryByText("위치 정보가 등록되지 않은 장소예요.")).not.toBeInTheDocument();
  expect(screen.queryByText("장소 정보가 등록되지 않은 장소예요.")).not.toBeInTheDocument();
  expect(mockedFetchSpotDetail).toHaveBeenCalledWith("1");
});

test("shows a labeled similar photo and clear notices when spot data is missing", async () => {
  mockedFetchSpotDetail.mockResolvedValue({
    spotId: 2,
    title: "이름만 있는 장소",
    category: "관광지",
    region: null,
    sigungu: null,
    address: null,
    latitude: null,
    longitude: null,
    thumbnail: null,
    description: null,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    images: null,
    info: null,
    isLiked: false,
  });

  renderAt("2");

  expect(await screen.findByRole("heading", { name: "이름만 있는 장소" })).toBeInTheDocument();
  expect(screen.queryByText("null")).not.toBeInTheDocument();
  expect(screen.getByText("주소 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
  expect(screen.getByText("위치 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
  expect(screen.getByText("장소 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
  expect(screen.getByText("이용 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
  // 메인 사진 하나만 있어야 한다 (갤러리 없음)
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(screen.getByRole("img")).toHaveAttribute("src", getSimilarSpotImage({
    spotId: 2, title: "이름만 있는 장소", category: "관광지",
  }).url);
  expect(screen.getByRole("img")).toHaveAccessibleName(/이름만 있는 장소 유사 이미지:/);
  expect(screen.getByText("유사 이미지")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "유사 이미지 출처" })).toHaveAttribute("href", "/image-credits#similar-images");
  expect(screen.queryByRole("button", { name: "다음 사진" })).not.toBeInTheDocument();
});

test("renders extra photos as a gallery when images are present", async () => {
  mockedFetchSpotDetail.mockResolvedValue({
    spotId: 1,
    title: "국립대관령자연휴양림",
    category: "관광지",
    region: "51",
    sigungu: "150",
    address: null,
    latitude: null,
    longitude: null,
    thumbnail: "https://example.com/main.jpg",
    description: null,
    viewCount: 1,
    likeCount: 0,
    commentCount: 0,
    images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
    info: null,
    isLiked: false,
  });

  renderAt("1");

  await screen.findByRole("heading", { name: "국립대관령자연휴양림" });
  // 메인 사진 1장 + 대표 사진을 포함한 갤러리 3장
  expect(screen.getAllByRole("img")).toHaveLength(4);
  const counter = screen.getByRole("status", { name: "현재 사진" });
  expect(counter).toHaveTextContent("1 / 3");
  expect(screen.getByRole("img", { name: "국립대관령자연휴양림" }).parentElement).not.toContainElement(counter);
  expect(screen.getByAltText("국립대관령자연휴양림 사진 2")).toHaveAttribute(
    "src",
    "https://example.com/1.jpg",
  );
  expect(screen.getByAltText("국립대관령자연휴양림 사진 3")).toHaveAttribute(
    "src",
    "https://example.com/2.jpg",
  );
});

test("renders only the usage info fields that have a value", async () => {
  mockedFetchSpotDetail.mockResolvedValue({
    spotId: 1,
    title: "국립대관령자연휴양림",
    category: "관광지",
    region: null,
    sigungu: null,
    address: null,
    latitude: null,
    longitude: null,
    thumbnail: null,
    description: null,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    images: [],
    info: {
      tel: "033-641-9990",
      parkInfo: "가능",
      timeInfo: "09:00~18:00",
      restInfo: "매주 화요일",
      firstMenu: null,
      treatMenu: null,
      lcnsno: null,
    },
    isLiked: false,
  });

  renderAt("1");

  await screen.findByRole("heading", { name: "국립대관령자연휴양림" });
  expect(screen.getByText("이용 안내")).toBeInTheDocument();
  expect(screen.getByText("033-641-9990")).toBeInTheDocument();
  expect(screen.getByText("가능")).toBeInTheDocument();
  expect(screen.getByText("09:00~18:00")).toBeInTheDocument();
  expect(screen.getByText("매주 화요일")).toBeInTheDocument();
  expect(screen.queryByText("대표메뉴")).not.toBeInTheDocument();
  expect(screen.queryByText("취급메뉴")).not.toBeInTheDocument();
  expect(screen.queryByText("인허가번호")).not.toBeInTheDocument();
});

test("shows restaurant menu fields when the spot has them", async () => {
  mockedFetchSpotDetail.mockResolvedValue({
    spotId: 523,
    title: "롱블랙",
    category: "음식점",
    region: null,
    sigungu: null,
    address: null,
    latitude: null,
    longitude: null,
    thumbnail: null,
    description: null,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    images: [],
    info: {
      tel: null,
      parkInfo: null,
      timeInfo: null,
      restInfo: null,
      firstMenu: "롱블랙",
      treatMenu: "초당옥수수라떼",
      lcnsno: "20180405110",
    },
    isLiked: false,
  });

  renderAt("523");

  await screen.findByRole("heading", { name: "롱블랙" });
  expect(screen.getByText("대표메뉴")).toBeInTheDocument();
  expect(screen.getByText("롱블랙", { selector: "dd" })).toBeInTheDocument();
  expect(screen.getByText("취급메뉴")).toBeInTheDocument();
  expect(screen.getByText("초당옥수수라떼")).toBeInTheDocument();
  expect(screen.getByText("인허가번호")).toBeInTheDocument();
  expect(screen.getByText("20180405110")).toBeInTheDocument();
});

function spotFixture(overrides: Partial<SpotDetail>): SpotDetail {
  return {
    spotId: 1,
    title: "정동진",
    category: "관광지",
    region: null,
    sigungu: null,
    address: null,
    latitude: null,
    longitude: null,
    thumbnail: null,
    description: null,
    viewCount: 0,
    likeCount: 3,
    commentCount: 0,
    images: [],
    info: null,
    isLiked: false,
    ...overrides,
  };
}

test("renders tour markup as readable plain text with line breaks and decoded entities", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({
    description: '<strong>바다 &amp; 산</strong><BR />가까운&nbsp;여행<img src="invalid" onerror="alert(1)">',
    info: {
      tel: null,
      parkInfo: null,
      timeInfo: "<b>11:00~20:00</b><br>준비시간 14:30~16:30<br/>마지막 주문 19:30<BR />매장 이용",
      restInfo: null,
      firstMenu: null,
      treatMenu: null,
      lcnsno: null,
    },
  }));

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  const description = screen.getByText(/바다 & 산/);
  expect(description.textContent?.replace(/\u00a0/g, " ")).toBe("바다 & 산\n가까운 여행");
  expect(description.querySelector("strong, img")).toBeNull();
  expect(screen.getByText(/11:00~20:00/, { selector: "dd" }).textContent).toBe(
    "11:00~20:00\n준비시간 14:30~16:30\n마지막 주문 19:30\n매장 이용",
  );
});

test("renders usage details when only additional TourAPI information is available", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({
    info: {
      tel: null,
      parkInfo: null,
      timeInfo: null,
      restInfo: null,
      firstMenu: null,
      treatMenu: null,
      lcnsno: null,
      additionalInfo: "이용요금\n펜션 60,000원\n캠핑 35,000원\n\n부대시설\n샤워실",
    },
  }));

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  expect(screen.getByText("추가 안내", { selector: "dt" })).toBeInTheDocument();
  const details = screen.getByText(/이용요금/, { selector: "dd" });
  expect(details.textContent).toBe("이용요금\n펜션 60,000원\n캠핑 35,000원\n\n부대시설\n샤워실");
  expect(details).toHaveClass("whitespace-pre-line");
  expect(screen.queryByText("이용 정보가 등록되지 않은 장소예요.")).not.toBeInTheDocument();
  expect(screen.queryByText("이용시간")).not.toBeInTheDocument();
});

test("renders additional TourAPI markup as safe text while preserving its source labels", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({
    info: {
      tel: null,
      parkInfo: null,
      timeInfo: null,
      restInfo: null,
      firstMenu: null,
      treatMenu: null,
      lcnsno: null,
      additionalInfo: '이용요금\n펜션&nbsp;60,000원<br>캠핑 35,000원\n\n부대시설\n샤워실 &amp; 화장실<script>alert("untrusted")</script><img src="https://example.com/untrusted" onerror="alert(1)">',
    },
  }));

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  const details = screen.getByText(/이용요금/, { selector: "dd" });
  expect(details.textContent).toBe("이용요금\n펜션 60,000원\n캠핑 35,000원\n\n부대시설\n샤워실 & 화장실");
  expect(details.querySelector("script, img, br")).toBeNull();
  expect(screen.queryByText(/untrusted/)).not.toBeInTheDocument();
  expect(screen.getAllByRole("img")).toHaveLength(1);
});

test("treats empty markup, whitespace and null gallery entries as missing data", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({
    address: "&nbsp;",
    description: "<p><br></p>",
    thumbnail: "  ",
    images: [null, "", "  "],
    info: {
      tel: "",
      parkInfo: "   ",
      timeInfo: "<br><BR />",
      restInfo: "&nbsp;",
      firstMenu: "<span> </span>",
      treatMenu: null,
      lcnsno: "\n\t",
      additionalInfo: "<p><br>&nbsp;</p>",
    },
  }));

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  expect(screen.getByText("주소 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
  expect(screen.getByText("장소 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
  expect(screen.getByText("이용 정보가 등록되지 않은 장소예요.")).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute("src", getSimilarSpotImage(spotFixture({})).url);
  expect(screen.queryByText("이용시간")).not.toBeInTheDocument();
});

test("preserves the address and exact source hours while discarding active markup", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({
    title: "봉평막국수",
    address: '강원특별자치도&nbsp;삼척시<BR data-source="tourapi">회강길 609-28 (자원동)',
    description: '<p>방문 안내</p><script>alert("untrusted")</script><style>body { display: none; }</style><iframe src="https://example.com/untrusted">숨김</iframe><img src="https://example.com/untrusted" onerror="alert(1)">',
    info: {
      tel: "033-575-7676",
      parkInfo: null,
      timeInfo: '- 11:00&#126;20:00<br data-source="tourapi">- 준비시간 14:30&#x7e;16:30',
      restInfo: "매주 수요일",
      firstMenu: null,
      treatMenu: null,
      lcnsno: null,
    },
  }));

  renderAt("1");
  await screen.findByRole("heading", { name: "봉평막국수" });

  const address = screen.getByText(/강원특별자치도 삼척시/);
  expect(address.textContent).toBe("강원특별자치도 삼척시\n회강길 609-28 (자원동)");
  expect(address).toHaveClass("whitespace-pre-line");
  const hours = screen.getByText(/11:00~20:00/, { selector: "dd" });
  expect(hours.textContent).toBe("- 11:00~20:00\n- 준비시간 14:30~16:30");
  expect(hours).toHaveClass("whitespace-pre-line");
  const description = screen.getByText("방문 안내");
  expect(description.querySelector("script, style, iframe, img")).toBeNull();
  expect(screen.queryByText(/untrusted|숨김|display: none/)).not.toBeInTheDocument();
  expect(screen.getAllByRole("img")).toHaveLength(1);
});

test("gallery selection and wrapping controls keep the main image, thumbnail and counter in sync", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({
    thumbnail: "https://example.com/main.jpg",
    images: ["https://example.com/1.jpg", "https://example.com/main.jpg", "https://example.com/2.jpg"],
  }));

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  const coverPhoto = screen.getByRole("button", { name: "정동진 사진 1 보기" });
  const firstPhoto = screen.getByRole("button", { name: "정동진 사진 2 보기" });
  const secondPhoto = screen.getByRole("button", { name: "정동진 사진 3 보기" });
  const counter = screen.getByRole("status", { name: "현재 사진" });
  expect(screen.getAllByRole("img")).toHaveLength(4);
  expect(coverPhoto).toHaveAttribute("aria-pressed", "true");
  expect(counter).toHaveTextContent("1 / 3");

  fireEvent.click(firstPhoto);
  expect(screen.getByRole("img", { name: "정동진" })).toHaveAttribute("src", "https://example.com/1.jpg");
  expect(firstPhoto).toHaveAttribute("aria-pressed", "true");
  expect(secondPhoto).toHaveAttribute("aria-pressed", "false");
  expect(counter).toHaveTextContent("2 / 3");

  fireEvent.click(secondPhoto);
  expect(screen.getByRole("img", { name: "정동진" })).toHaveAttribute("src", "https://example.com/2.jpg");
  expect(firstPhoto).toHaveAttribute("aria-pressed", "false");
  expect(secondPhoto).toHaveAttribute("aria-pressed", "true");
  expect(counter).toHaveTextContent("3 / 3");

  fireEvent.click(screen.getByRole("button", { name: "다음 사진" }));
  expect(screen.getByRole("img", { name: "정동진" })).toHaveAttribute("src", "https://example.com/main.jpg");
  expect(coverPhoto).toHaveAttribute("aria-pressed", "true");
  expect(counter).toHaveTextContent("1 / 3");

  fireEvent.click(screen.getByRole("button", { name: "이전 사진" }));
  expect(screen.getByRole("img", { name: "정동진" })).toHaveAttribute("src", "https://example.com/2.jpg");
  expect(secondPhoto).toHaveAttribute("aria-pressed", "true");
  expect(counter).toHaveTextContent("3 / 3");
});

test("uses the first actual gallery photo when the thumbnail is absent and ignores duplicate or blank entries", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({
    thumbnail: null,
    images: [null, "  ", " https://example.com/first.jpg ", "https://example.com/first.jpg", "https://example.com/second.jpg"],
  }));

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  expect(screen.getByRole("img", { name: "정동진" })).toHaveAttribute("src", "https://example.com/first.jpg");
  expect(screen.getByRole("status", { name: "현재 사진" })).toHaveTextContent("1 / 2");
  expect(screen.getAllByRole("img")).toHaveLength(3);
  expect(screen.queryByText("유사 이미지")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다음 사진" }));
  expect(screen.getByRole("img", { name: "정동진" })).toHaveAttribute("src", "https://example.com/second.jpg");
});

test("recovers a failed representative photo with a similar image, then the placeholder if that also fails", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({
    thumbnail: "https://example.com/broken-main.jpg",
    images: ["https://example.com/broken-gallery.jpg"],
  }));

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  const mainImage = screen.getByRole("img", { name: "정동진" });
  fireEvent.error(mainImage);
  expect(mainImage).toHaveAttribute("src", getSimilarSpotImage(spotFixture({})).url);
  expect(mainImage).toHaveAccessibleName(/정동진 유사 이미지:/);
  expect(screen.getByText("유사 이미지")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "유사 이미지 출처" })).toHaveAttribute("href", "/image-credits#similar-images");
  fireEvent.error(mainImage);
  expect(mainImage).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
  expect(screen.queryByText("유사 이미지")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "유사 이미지 출처" })).not.toBeInTheDocument();

  const galleryImage = screen.getByAltText("정동진 사진 2");
  fireEvent.error(galleryImage);
  expect(galleryImage).toHaveAttribute("src", FALLBACK_SPOT_IMAGE);
});

test("클릭하면 좋아요를 요청하고 하트와 카운트를 갱신한다", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({ isLiked: false, likeCount: 3 }));
  mockedLikeSpot.mockResolvedValue({ liked: true, likeCount: 4 });

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  const likeButton = screen.getByRole("button", { name: "정동진 좋아요" });
  expect(likeButton).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(likeButton);

  expect(await screen.findByText("좋아요 4")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "정동진 좋아요 취소" })).toHaveAttribute("aria-pressed", "true");
  expect(mockedLikeSpot).toHaveBeenCalledWith(1);
});

test("이미 좋아요한 상태에서 클릭하면 취소를 요청한다", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({ isLiked: true, likeCount: 4 }));
  mockedUnlikeSpot.mockResolvedValue({ liked: false, likeCount: 3 });

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  fireEvent.click(screen.getByRole("button", { name: "정동진 좋아요 취소" }));

  expect(await screen.findByText("좋아요 3")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "정동진 좋아요" })).toHaveAttribute("aria-pressed", "false");
  expect(mockedUnlikeSpot).toHaveBeenCalledWith(1);
});

test("로그인이 필요하면(401/403) 로그인 페이지로 이동한다", async () => {
  mockedFetchSpotDetail.mockResolvedValue(spotFixture({ isLiked: false }));
  mockedLikeSpot.mockRejectedValue(new UnauthorizedError());

  renderAt("1");
  await screen.findByRole("heading", { name: "정동진" });

  fireEvent.click(screen.getByRole("button", { name: "정동진 좋아요" }));

  expect(await screen.findByText("로그인 페이지")).toBeInTheDocument();
});

test("shows a not-found message when the spot doesn't exist", async () => {
  mockedFetchSpotDetail.mockResolvedValue(null);

  renderAt("999");

  expect(await screen.findByText("존재하지 않는 장소예요.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "돌아가기" })).toBeInTheDocument();
});

test("shows the same not-found message when the fetch fails", async () => {
  mockedFetchSpotDetail.mockRejectedValue(new Error("network error"));

  renderAt("1");

  await waitFor(() => {
    expect(screen.getByText("존재하지 않는 장소예요.")).toBeInTheDocument();
  });
});
