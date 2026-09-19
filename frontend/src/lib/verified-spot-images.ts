import catalog from "@/constants/verified-spot-images.json";

export const verifiedSpotImages = catalog.images;

/** 사진 URL로 출처를 찾는다. 장소가 같아도 다른 사진의 출처는 붙이지 않는다. */
export function getVerifiedSpotImageCredit(source: string | null | undefined) {
  const url = source?.trim();
  if (!url) return undefined;

  return verifiedSpotImages.find((image) => image.url === url);
}

export function getVerifiedSpotImageTitle(source: string | null | undefined) {
  const credit = getVerifiedSpotImageCredit(source);
  return credit
    ? `사진: ${credit.author} · ${credit.license} · 출처: ${credit.sourceUrl}`
    : undefined;
}
