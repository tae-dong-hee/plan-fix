import { afterEach, describe, expect, it, vi } from "vitest";

import catalog from "@/constants/course-cover-images.json";
import { getCourseCoverCredit, getCourseCoverImageSrc } from "./course-cover-images";

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
