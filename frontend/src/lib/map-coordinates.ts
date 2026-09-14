type MapCoordinates = {
  latitude?: number | null;
  longitude?: number | null;
};

/** 국내 여행 지도에 표시할 수 있는 좌표인지 확인한다. 원본 장소 데이터는 유지한다. */
export function hasMapCoordinates<T extends MapCoordinates>(
  spot: T,
): spot is T & { latitude: number; longitude: number } {
  return typeof spot.latitude === "number"
    && Number.isFinite(spot.latitude)
    && spot.latitude >= 33
    && spot.latitude <= 39.5
    && typeof spot.longitude === "number"
    && Number.isFinite(spot.longitude)
    && spot.longitude >= 124
    && spot.longitude <= 132;
}
