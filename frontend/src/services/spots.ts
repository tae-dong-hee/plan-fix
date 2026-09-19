export type PopularSpot = {
  spotId: number;
  title: string;
  category: string;
  region: string | null;
  sigungu: string | null;
  thumbnail: string | null;
  /** 지도 표시용 좌표. 수집 데이터에 좌표가 없으면 null로 내려온다. */
  latitude?: number | null;
  longitude?: number | null;
  isLiked?: boolean;
};

export type PopularSpotsResult = {
  items: PopularSpot[];
  offset: number;
  size: number;
  totalCount: number;
};

export type SpotListResponse = PopularSpotsResult;

export type PopularSpotsParams = {
  region?: string;
  sigungu?: string;
  size?: number;
  offset?: number;
};

export type SearchSpotsParams = {
  keyword?: string;
  category?: string;
  region?: string;
  sigungu?: string;
  sort?: "latest" | "popular";
  offset?: number;
  size?: number;
};

/** detailIntro2와 detailInfo2 결과. 음식점이 아니면 firstMenu/treatMenu/lcnsno는 null이다. */
export type SpotTourInfo = {
  tel: string | null;
  parkInfo: string | null;
  timeInfo: string | null;
  restInfo: string | null;
  firstMenu: string | null;
  treatMenu: string | null;
  lcnsno: string | null;
  /** detailInfo2의 이용요금, 부대시설 등 반복 안내 정보. */
  additionalInfo?: string | null;
};

export type SpotDetail = {
  spotId: number;
  title: string;
  category: string;
  region: string | null;
  sigungu: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  thumbnail: string | null;
  description: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  images: (string | null)[] | null;
  info: SpotTourInfo | null;
  isLiked: boolean;
};

export type SpotLikeState = {
  liked: boolean;
  likeCount: number;
};

/** 좋아요/취소/코스 API가 인증되지 않은 상태(401/403)로 실패했을 때 던진다. */
export class UnauthorizedError extends Error {
  constructor() {
    super("로그인이 필요합니다.");
    this.name = "UnauthorizedError";
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

/** 공개 API라 인증 쿠키가 필요 없다. 백엔드 미설정 환경(예: 테스트)에서는 빈 목록으로 조용히 넘어간다. */
export async function fetchPopularSpots(params: PopularSpotsParams = {}): Promise<PopularSpotsResult> {
  if (!apiBaseUrl) {
    return {
      items: [],
      offset: params.offset ?? 0,
      size: params.size ?? 2,
      totalCount: 0,
    };
  }

  const query = new URLSearchParams({ sort: "popular", size: String(params.size ?? 2) });
  if (params.region) {
    query.set("region", params.region);
  }
  if (params.sigungu) {
    query.set("sigungu", params.sigungu);
  }
  if (params.offset !== undefined) {
    query.set("offset", String(params.offset));
  }

  const response = await fetch(`${apiBaseUrl}/spots?${query.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("인기 장소를 불러오지 못했습니다.");
  }

  const body = (await response.json()) as PopularSpotsResult;
  return body;
}

/** 키워드, 카테고리, 지역 검색 지원 */
export async function searchSpots(params: SearchSpotsParams = {}): Promise<SpotListResponse> {
  if (!apiBaseUrl) {
    return {
      items: [],
      offset: params.offset ?? 0,
      size: params.size ?? 20,
      totalCount: 0,
    };
  }

  const query = new URLSearchParams();
  if (params.keyword?.trim()) {
    query.set("keyword", params.keyword.trim());
  }
  if (params.category) {
    query.set("category", params.category);
  }
  if (params.region) {
    query.set("region", params.region);
  }
  if (params.sigungu) {
    query.set("sigungu", params.sigungu);
  }
  if (params.sort) {
    query.set("sort", params.sort);
  }
  if (params.offset !== undefined) {
    query.set("offset", String(params.offset));
  }
  if (params.size !== undefined) {
    query.set("size", String(params.size));
  }

  const response = await fetch(`${apiBaseUrl}/spots?${query.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("장소 목록을 불러오지 못했습니다.");
  }

  return (await response.json()) as SpotListResponse;
}

/**
 * 존재하지 않거나(404) 백엔드 미설정 환경에서는 null을 반환한다 — 페이지 쪽에서
 * "없음"과 "네트워크 에러"를 구분해 보여줄 수 있도록, 그 외 실패는 에러로 던진다.
 */
export async function fetchSpotDetail(spotId: number | string): Promise<SpotDetail | null> {
  if (!apiBaseUrl) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/spots/${spotId}`, { credentials: "include" });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("장소 정보를 불러오지 못했습니다.");
  }

  return (await response.json()) as SpotDetail;
}

/** 이미 좋아요한 상태에서 또 호출해도 에러 없이 현재 상태를 그대로 돌려준다(idempotent). */
export async function likeSpot(spotId: number | string): Promise<SpotLikeState> {
  return callLikeApi(spotId, "POST");
}

/** 좋아요하지 않은 상태에서 호출해도 에러 없이 현재 상태를 그대로 돌려준다(idempotent). */
export async function unlikeSpot(spotId: number | string): Promise<SpotLikeState> {
  return callLikeApi(spotId, "DELETE");
}

async function callLikeApi(spotId: number | string, method: "POST" | "DELETE"): Promise<SpotLikeState> {
  if (!apiBaseUrl) {
    throw new UnauthorizedError();
  }

  const response = await fetch(`${apiBaseUrl}/spots/${spotId}/like`, {
    method,
    credentials: "include",
  });

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("좋아요 처리에 실패했습니다.");
  }

  return (await response.json()) as SpotLikeState;
}
