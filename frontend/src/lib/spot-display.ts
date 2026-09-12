export const MISSING_SPOT_ADDRESS = "주소 정보가 등록되지 않은 장소예요.";
export const MISSING_SPOT_LOCATION = "위치 정보가 등록되지 않은 장소예요.";
export const MISSING_SPOT_DESCRIPTION = "장소 정보가 등록되지 않은 장소예요.";
export const MISSING_SPOT_USAGE = "이용 정보가 등록되지 않은 장소예요.";

export function hasSpotCoordinates(spot: {
  latitude?: number | null;
  longitude?: number | null;
}): boolean {
  const { latitude, longitude } = spot;
  return typeof latitude === "number" && Number.isFinite(latitude) && Math.abs(latitude) <= 90
    && typeof longitude === "number" && Number.isFinite(longitude) && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0);
}
