import { formatSpotRegion, GANGWON_SEARCH_REGIONS, inferCourseSearchRegions } from "./course-search-regions";
import { MISSING_SPOT_LOCATION } from "./spot-display";

describe("inferCourseSearchRegions", () => {
  it("선택한 일차에 있는 모든 시군을 중복 없이 유지한다", () => {
    expect(inferCourseSearchRegions([
      [{ region: "51", sigungu: "110" }],
      [
        { region: "51", sigungu: "150" },
        { region: "51", sigungu: "210" },
        { region: "51", sigungu: "150" },
        { region: null, sigungu: null },
        { region: "51", sigungu: null },
      ],
    ], 1)).toEqual([
      { region: "51", sigungu: "150", label: "강원 강릉" },
      { region: "51", sigungu: "210", label: "강원 속초" },
    ]);
  });

  it("선택한 일차의 시군을 모르면 코스의 모든 시군으로 범위를 정한다", () => {
    expect(inferCourseSearchRegions([
      [{ region: "51", sigungu: "150" }],
      [{ region: "51", sigungu: null }],
      [{ region: "51", sigungu: "210" }],
    ], 1)).toEqual([
      { region: "51", sigungu: "150", label: "강원 강릉" },
      { region: "51", sigungu: "210", label: "강원 속초" },
    ]);
  });

  it("이전 초안의 지역 이름과 공백이 있는 코드를 정규화한다", () => {
    expect(inferCourseSearchRegions([[
      { region: "강원특별자치도", sigungu: "강릉시" },
      { region: " 51 ", sigungu: " 150 " },
      { region: "강원도", sigungu: "평창군" },
      { region: null, sigungu: "속초" },
    ]], 0)).toEqual([
      { region: "51", sigungu: "150", label: "강원 강릉" },
      { region: "51", sigungu: "760", label: "강원 평창" },
      { region: "51", sigungu: "210", label: "강원 속초" },
    ]);
  });

  it("코스에 시군 정보가 없으면 모달에서 지역을 고를 수 있게 비운다", () => {
    expect(inferCourseSearchRegions([[], [{ region: null, sigungu: "150" }]], 0)).toEqual([]);
    expect(inferCourseSearchRegions([[{ region: "51", sigungu: null }]], 0)).toEqual([]);
  });

  it("다른 시도의 시군을 강원으로 바꾸지 않는다", () => {
    expect(inferCourseSearchRegions([[
      { region: "48", sigungu: "820" },
      { region: "경남", sigungu: "고성군" },
    ]], 0)).toEqual([
      { region: "48", sigungu: "820", label: "48 820" },
      { region: "경남", sigungu: "고성군", label: "경남 고성군" },
    ]);
  });
});

describe("formatSpotRegion", () => {
  it("강원 시군구 코드를 이름으로 표시한다", () => {
    expect(formatSpotRegion({ region: "51", sigungu: "760" })).toBe("강원 평창");
    expect(formatSpotRegion({ region: "강원도", sigungu: "강릉시" })).toBe("강원 강릉");
    expect(formatSpotRegion({ region: "51", sigungu: null })).toBe("강원");
  });

  it("지역 정보가 없으면 안내 문구를 표시한다", () => {
    expect(formatSpotRegion({ region: " ", sigungu: null })).toBe(MISSING_SPOT_LOCATION);
  });

  it("새 코스에서 강원의 18개 시군을 선택할 수 있다", () => {
    expect(GANGWON_SEARCH_REGIONS).toHaveLength(18);
    expect(new Set(GANGWON_SEARCH_REGIONS.map((region) => region.sigungu)).size).toBe(18);
  });
});
