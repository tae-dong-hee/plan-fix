import { UnauthorizedError } from "@/services/spots";

export type BoardItem = {
  boardId: number;
  title: string;
  thumbnail: string | null;
  userId: number;
  likeCount: number;
  isLiked?: boolean;
  viewCount: number;
  commentCount: number;
  createdAt: string;
};

export type PopularBoard = BoardItem;

export type BoardListResult = {
  items: BoardItem[];
  offset: number;
  size: number;
  totalCount: number;
};

export type BoardListResponse = BoardListResult;

export type BoardImage = {
  imageUrl: string;
  altText: string | null;
  sequence: number;
};

export type BoardDetail = {
  boardId: number;
  courseId: number | null;
  userId: number;
  title: string;
  content: string;
  thumbnail: string | null;
  status: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  images: BoardImage[];
  isLiked?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PopularBoardsParams = {
  size?: number;
  offset?: number;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

export type BoardsParams = PopularBoardsParams & {
  sort?: "popular" | "latest";
};

/** 공개 목록도 로그인 쿠키를 보내 사용자의 좋아요 상태를 함께 받는다. */
export async function fetchBoards(params: BoardsParams = {}): Promise<BoardListResult> {
  if (!apiBaseUrl) {
    return {
      items: [],
      offset: params.offset ?? 0,
      size: params.size ?? 20,
      totalCount: 0,
    };
  }

  const query = new URLSearchParams({
    sort: params.sort ?? "popular",
    size: String(params.size ?? 20),
  });
  if (params.offset !== undefined) {
    query.set("offset", String(params.offset));
  }

  const response = await fetch(`${apiBaseUrl}/boards?${query.toString()}`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("게시글을 불러오지 못했습니다.");
  }

  return (await response.json()) as BoardListResult;
}

export function fetchPopularBoards(params: PopularBoardsParams = {}): Promise<BoardListResult> {
  return fetchBoards({ ...params, size: params.size ?? 6, sort: "popular" });
}

/**
 * 존재하지 않거나(404) 백엔드 미설정 환경에서는 null을 반환한다 — 페이지 쪽에서
 * "없음"과 "네트워크 에러"를 구분해 보여줄 수 있도록, 그 외 실패는 에러로 던진다.
 */
export async function fetchBoardDetail(boardId: number | string): Promise<BoardDetail | null> {
  if (!apiBaseUrl) {
    return null;
  }

  const response = await fetch(`${apiBaseUrl}/boards/${boardId}`, {
    credentials: "include",
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error("게시글을 불러오지 못했습니다.");
  }

  return (await response.json()) as BoardDetail;
}

export type BoardLikeState = {
  liked: boolean;
  likeCount: number;
};

/** 이미 좋아요한 상태에서 또 호출해도 에러 없이 현재 상태를 그대로 돌려준다(idempotent). */
export async function likeBoard(boardId: number | string): Promise<BoardLikeState> {
  return callBoardLikeApi(boardId, "POST");
}

/** 좋아요하지 않은 상태에서 호출해도 에러 없이 현재 상태를 그대로 돌려준다(idempotent). */
export async function unlikeBoard(boardId: number | string): Promise<BoardLikeState> {
  return callBoardLikeApi(boardId, "DELETE");
}

async function callBoardLikeApi(boardId: number | string, method: "POST" | "DELETE"): Promise<BoardLikeState> {
  if (!apiBaseUrl) {
    throw new UnauthorizedError();
  }

  const response = await fetch(`${apiBaseUrl}/boards/${boardId}/like`, {
    method,
    credentials: "include",
  });

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("좋아요 처리에 실패했습니다.");
  }

  return (await response.json()) as BoardLikeState;
}

export type CreateBoardImageInput = {
  imageUrl: string;
  altText?: string | null;
};

export type CreateBoardPayload = {
  title: string;
  content: string;
  thumbnail?: string | null;
  courseId?: number | null;
  images?: CreateBoardImageInput[];
};

/**
 * 신규 게시글 작성 API 호출 (로그인 쿠키 필요)
 */
export async function createBoard(payload: CreateBoardPayload): Promise<BoardDetail> {
  if (!apiBaseUrl) {
    throw new Error("API URL이 설정되지 않았습니다.");
  }

  const response = await fetch(`${apiBaseUrl}/boards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("로그인이 필요합니다.");
  }

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.message) {
        throw new Error(parsed.message);
      }
    } catch {
      // JSON 파싱 실패 시 일반 에러 사용
    }
    throw new Error(errorBody || "게시글 저장에 실패했습니다.");
  }

  return (await response.json()) as BoardDetail;
}
