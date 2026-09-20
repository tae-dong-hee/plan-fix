import catalog from "@/constants/verified-google-places.json";

export type GooglePlaceSpot = {
  spotId: number;
  title: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  thumbnail: string | null;
  images: (string | null)[] | null;
};

export type GoogleCoverSpot = Pick<GooglePlaceSpot, "spotId" | "title" | "thumbnail">
  & Partial<Pick<GooglePlaceSpot, "address" | "latitude" | "longitude" | "images">>;

/** 주소를 생략하는 목록 API는 검수한 ID·이름·좌표를 모두 대조한다. 제공된 주소도 정확히 일치해야 한다. */
export function getVerifiedGoogleCoverPlaceId(spot: GoogleCoverSpot, source: unknown = catalog): string | null {
  if ([spot.thumbnail, ...(spot.images ?? [])].some((image) => image?.trim())) return null;
  if (!spot.title.trim()
    || typeof spot.latitude !== "number" || !Number.isFinite(spot.latitude) || Math.abs(spot.latitude) > 90
    || typeof spot.longitude !== "number" || !Number.isFinite(spot.longitude) || Math.abs(spot.longitude) > 180) return null;
  if (!source || typeof source !== "object" || !("version" in source) || source.version !== 1
    || !("places" in source) || !Array.isArray(source.places)) return null;

  const matches = source.places.filter((entry: unknown): entry is Record<string, unknown> =>
    Boolean(entry && typeof entry === "object" && "spotId" in entry && entry.spotId === spot.spotId));
  if (matches.length !== 1) return null;
  const entry = matches[0];
  if (entry.title !== spot.title || entry.latitude !== spot.latitude || entry.longitude !== spot.longitude
    || (spot.address !== undefined && entry.address !== spot.address)
    || typeof entry.placeId !== "string" || !/^[A-Za-z0-9_-]+$/.test(entry.placeId)) return null;
  return entry.placeId;
}

/** Google 사진 URL 대신 검수한 장소 ID만 연결한다. 원본 장소 정보가 바뀌면 다시 검수한다. */
export function getVerifiedGooglePlaceId(spot: GooglePlaceSpot, source: unknown = catalog): string | null {
  if ([spot.thumbnail, ...(spot.images ?? [])].some((image) => image?.trim())) return null;
  if (!spot.title.trim() || !spot.address?.trim()
    || typeof spot.latitude !== "number" || !Number.isFinite(spot.latitude) || Math.abs(spot.latitude) > 90
    || typeof spot.longitude !== "number" || !Number.isFinite(spot.longitude) || Math.abs(spot.longitude) > 180) return null;
  if (!source || typeof source !== "object" || !("version" in source) || source.version !== 1
    || !("places" in source) || !Array.isArray(source.places)) return null;

  const matches = source.places.filter((entry: unknown): entry is Record<string, unknown> =>
    Boolean(entry && typeof entry === "object" && "spotId" in entry && entry.spotId === spot.spotId));
  // 중복 승인도 자동 선택하지 않는다.
  if (matches.length !== 1) return null;
  const entry = matches[0];
  if (entry.title !== spot.title || entry.address !== spot.address
    || entry.latitude !== spot.latitude || entry.longitude !== spot.longitude
    || typeof entry.placeId !== "string" || !/^[A-Za-z0-9_-]+$/.test(entry.placeId)) return null;
  return entry.placeId;
}
