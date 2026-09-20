import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { getSimilarSpotImage, similarSpotImages } from "@/lib/similar-spot-images";
import { SPOT_CATEGORY_OPTIONS } from "@/constants/spot-categories";

test.each([
  ["음식점", "바다횟집", "sashimi"],
  ["음식점", "정은숙초당순두부", "tofu"],
  ["음식점", "초당본가짬뽕순두부", "spicy-tofu"],
  ["음식점", "춘천수미닭갈비", "dakgalbi"],
  ["음식점", "동해막국수", "noodles"],
  ["음식점", "강릉감자옹심 강릉본점", "dumplings"],
  ["음식점", "장수삼계탕", "chicken-soup"],
  ["음식점", "횡성한우국밥", "soup"],
  ["음식점", "강릉한우만", "beef"],
  ["음식점", "제주해인물회", "mulhoe"],
  ["음식점", "맥도날드 강릉점", "burger"],
  ["음식점", "교동짬뽕", "jjamppong"],
  ["카페/음료", "순두부젤라또 2호점", "icecream"],
  ["카페/음료", "강릉 빵명장", "bakery"],
  ["카페/음료", "카페 느리게", "coffee"],
  ["숙박", "바닷가모텔", "hotel"],
  ["숙박", "한옥스테이 파인앤프렌즈", "hanok"],
  ["숙박", "대관령 품안에펜션", "pension"],
  ["레포츠", "소노카페 오토캠핑장", "camping"],
  ["레포츠", "동강시스타CC", "golf"],
  ["레포츠", "모쿠서프", "surf"],
  ["문화시설", "평창무이예술관", "gallery"],
  ["문화시설", "동네책방 스몰굿씽", "books"],
  ["쇼핑", "옥계5일장", "market"],
  ["관광지", "가리산자연휴양림", "forest"],
  ["관광지", "감악산(원주)", "mountain"],
  ["관광지", "어달해변", "beach"],
  ["관광지", "소승폭포", "river"],
])("%s %s uses a matching subject", (category, title, kind) => {
  expect(getSimilarSpotImage({ spotId: 10, title, category, sigungu: "150" }).kind).toBe(kind);
});

test("prefers the same region within the matching subject, and is stable across list order", () => {
  const beach = { spotId: 10, title: "사진 없는 해변", category: "관광지", sigungu: "820" };
  const selected = getSimilarSpotImage(beach);
  expect(selected.regions).toContain("820");
  getSimilarSpotImage({ ...beach, spotId: 99, title: "다른 해변" });
  expect(getSimilarSpotImage(beach)).toEqual(selected);
  // 지역 사진이 없어도 다른 업종이나 기본 그림으로 바꾸지 않는다.
  expect(getSimilarSpotImage({ ...beach, sigungu: "000" }).kind).toBe("beach");
});

test("uses verified menu hints for opaque restaurant names but discards hints after renaming or recategorizing", () => {
  const spot = { spotId: 4510, title: "용바위식당", category: "음식점" };
  expect(getSimilarSpotImage(spot).kind).toBe("fish"); // 등록 대표 메뉴: 황태구이정식
  expect(getSimilarSpotImage({ ...spot, title: "새로운 식당" }).kind).toBe("meal");
  expect(getSimilarSpotImage({ ...spot, category: "카페/음료" }).kind).toBe("coffee");
  expect(getSimilarSpotImage({ spotId: 942, title: "임계식당", category: "음식점" }).kind).toBe("soup");
});

test.each([...SPOT_CATEGORY_OPTIONS, "미분류"])("%s has a fallback even without a title keyword or region", (category) => {
  expect(getSimilarSpotImage({ spotId: 1, title: "새로운 장소", category }).url).toMatch(/^\/images\/spot-fallbacks\/.+\.webp$/);
});

test("all selected photos are bundled and retain their original source and attribution", () => {
  expect(new Set(similarSpotImages.map((image) => image.id)).size).toBe(similarSpotImages.length);
  for (const image of similarSpotImages) {
    expect(existsSync(resolve(process.cwd(), "public", image.url.slice(1)))).toBe(true);
    expect(image.sourceUrl).toMatch(/^https:\/\//);
    expect(image.author).not.toBe("");
    expect(image.license).not.toBe("");
  }
});
