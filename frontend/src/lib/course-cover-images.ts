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
