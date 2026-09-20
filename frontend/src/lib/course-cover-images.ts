import catalog from "@/constants/course-cover-images.json";

export function getCourseCoverCredit(thumbnail: string | null | undefined) {
  return catalog.images.find((image) => image.url === thumbnail?.trim());
}

/** 비공개 S3의 기본 사진은 등록된 이미지 전용 API로 읽는다. */
export function getCourseCoverImageSrc(thumbnail: string): string {
  const credit = getCourseCoverCredit(thumbnail);
  if (!credit) return thumbnail;
  const base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api/v1";
  const version = credit.s3Key.split("/")[2];
  return `${base}/images/course-covers/${credit.id}?v=${version}`;
}

/** 서버가 장소 사진을 최대한 분산한 뒤에도 중복되는 코스는 메인에서 한 번만 노출한다. */
export function selectCoursesWithUniqueCovers<T extends { thumbnail: string | null }>(courses: T[]): T[] {
  const usedImages = new Set<string>();
  return courses.filter((course) => {
    const thumbnail = course.thumbnail?.trim();
    if (!thumbnail) return true;

    let key = getCourseCoverImageSrc(thumbnail);
    try {
      const url = new URL(key, "https://planfix.invalid");
      // 조각과 쿼리 순서만 정규화한다. 사진 자체를 지정하는 쿼리 값은 보존한다.
      url.hash = "";
      url.searchParams.sort();
      key = url.href;
    } catch {
      // 상대 경로 이외의 형식도 같은 문자열이면 중복으로 처리한다.
    }
    if (usedImages.has(key)) return false;
    usedImages.add(key);
    return true;
  });
}
