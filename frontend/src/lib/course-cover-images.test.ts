import { afterEach, describe, expect, it, vi } from "vitest";

import catalog from "@/constants/course-cover-images.json";
import { getCourseCoverCredit, getCourseCoverImageSrc, selectCoursesWithUniqueCovers } from "./course-cover-images";

afterEach(() => vi.unstubAllEnvs());

describe("코스 기본 사진", () => {
  it("등록된 S3 사진만 API 서버의 사진 경로로 연결한다", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/api/v1/");
    const cover = catalog.images[0];
    expect(getCourseCoverImageSrc(cover.url)).toBe(
      `https://api.example.com/api/v1/images/course-covers/${cover.id}?v=2026-09-v1`,
    );
    expect(getCourseCoverCredit(cover.url)?.sourceUrl).toBe(cover.sourceUrl);
  });

  it("직접 지정한 사진이나 같은 버킷의 다른 파일은 변경하지 않는다", () => {
    const customImage = "https://example.com/my-course.jpg";
    const otherS3Image = catalog.images[0].url.replace(/[^/]+$/, "private-photo.jpg");
    for (const url of [customImage, otherS3Image]) {
      expect(getCourseCoverImageSrc(url)).toBe(url);
      expect(getCourseCoverCredit(url)).toBeUndefined();
    }
  });

  it("추가 사진은 해당 S3 버전으로 요청하고 기존 사진의 캐시 버전은 유지한다", () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api/v1");
    const added = catalog.images.find((image) => image.s3Key.includes("/2026-09-v2/"))!;
    expect(getCourseCoverImageSrc(added.url)).toBe(
      `/api/v1/images/course-covers/${added.id}?v=2026-09-v2`,
    );
    expect(getCourseCoverCredit(added.url)?.sourceUrl).toBe(added.sourceUrl);
    expect(getCourseCoverImageSrc(catalog.images[0].url)).toContain("?v=2026-09-v1");
  });

  it("상대 API 경로를 지원하고 사진이 없으면 출처를 표시하지 않는다", () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api/v1");
    const cover = catalog.images[0];
    expect(getCourseCoverImageSrc(cover.url)).toBe(
      `/api/v1/images/course-covers/${cover.id}?v=2026-09-v1`,
    );
    expect(getCourseCoverCredit(null)).toBeUndefined();
    expect(getCourseCoverCredit(" ")).toBeUndefined();
  });
});

describe("메인 코스 이미지 중복 제거", () => {
  it("첫 코스와 서로 다른 사진은 유지하고 같은 사진의 공백·조각·쿼리 순서는 무시한다", () => {
    const courses = [
      { courseId: 1, thumbnail: " https://example.com/photo.jpg?w=800&id=1 " },
      { courseId: 2, thumbnail: "https://example.com/photo.jpg?id=1&w=800#cover" },
      { courseId: 3, thumbnail: "https://example.com/photo.jpg?id=2&w=800" },
    ];
    expect(selectCoursesWithUniqueCovers(courses)).toEqual([courses[0], courses[2]]);
    expect(courses).toHaveLength(3);
  });

  it("기본 사진의 원본 주소와 실제 표시 API 주소도 같은 사진으로 처리한다", () => {
    vi.stubEnv("VITE_API_BASE_URL", "/api/v1");
    const courses = [
      { thumbnail: catalog.images[0].url },
      { thumbnail: getCourseCoverImageSrc(catalog.images[0].url) },
      { thumbnail: catalog.images[1].url },
    ];
    expect(selectCoursesWithUniqueCovers(courses)).toEqual([courses[0], courses[2]]);
  });

  it("대표 사진이 아직 없는 코스끼리는 같은 사진으로 판단하지 않는다", () => {
    const courses = [{ thumbnail: null }, { thumbnail: " " }];
    expect(selectCoursesWithUniqueCovers(courses)).toEqual(courses);
  });
});
