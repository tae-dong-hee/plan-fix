import type { DefaultAvatarColor } from "@/services/user";

export type BoardItem = {
  boardId: number;
  title: string;
  thumbnail: string | null;
  userId: number;
  likeCount: number;
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

/** 댓글 API 응답. parentCommentId로 일반 댓글과 대댓글을 구분한다. */
export type BoardComment = {
  commentId: number;
  userId: number;
  boardId: number;
  parentCommentId: number | null;
  content: string;
  status: "ACTIVE" | "DELETED";
  createdAt: string;
  updatedAt: string;
  authorName?: string | null;
  authorProfileImageUrl?: string | null;
  authorDefaultAvatarColor?: DefaultAvatarColor;
};

/** 게시글의 활성 댓글 목록 조회. 백엔드 주소가 없으면 빈 목록을 반환한다. */
export async function fetchBoardComments(boardId: number | string): Promise<BoardComment[]> {
  if (!apiBaseUrl) return [];
  const response = await fetch(`${apiBaseUrl}/boards/${boardId}/comments`, { credentials: "include" });
  if (!response.ok) throw new Error("댓글을 불러오지 못했습니다.");
  return (await response.json()) as BoardComment[];
}

/** 댓글·대댓글 등록. 인증 쿠키를 보내며, 대댓글일 때만 부모 댓글 ID를 지정한다. */
export async function createBoardComment(boardId: number | string, content: string, parentCommentId?: number | null): Promise<BoardComment> {
  const response = await fetch(`${apiBaseUrl}/boards/${boardId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ content, parentCommentId: parentCommentId ?? null }) });
  if (!response.ok) throw new Error("댓글을 등록하지 못했습니다.");
  return (await response.json()) as BoardComment;
}

/** 댓글 본문 수정. 작성자 권한은 백엔드에서 검사한다. */
export async function updateBoardComment(boardId: number | string, commentId: number, content: string): Promise<BoardComment> {
  const response = await fetch(`${apiBaseUrl}/boards/${boardId}/comments/${commentId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ content }) });
  if (!response.ok) throw new Error("댓글을 수정하지 못했습니다.");
  return (await response.json()) as BoardComment;
}

/** 댓글 삭제 요청. 성공 응답은 본문이 없는 204이므로 JSON 파싱을 하지 않는다. */
export async function deleteBoardComment(boardId: number | string, commentId: number): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/boards/${boardId}/comments/${commentId}`, { method: "DELETE", credentials: "include" });
  if (!response.ok) throw new Error("댓글을 삭제하지 못했습니다.");
}

export type PopularBoardsParams = {
  size?: number;
  offset?: number;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

/** 공개 API라 인증 쿠키가 필요 없다. 백엔드 미설정 환경(예: 테스트)에서는 빈 목록으로 조용히 넘어간다. */
export async function fetchPopularBoards(params: PopularBoardsParams = {}): Promise<BoardListResult> {
  if (!apiBaseUrl) {
    return {
      items: [],
      offset: params.offset ?? 0,
      size: params.size ?? 6,
      totalCount: 0,
    };
  }

  const query = new URLSearchParams({ sort: "popular", size: String(params.size ?? 6) });
  if (params.offset !== undefined) {
    query.set("offset", String(params.offset));
  }

  const response = await fetch(`${apiBaseUrl}/boards?${query.toString()}`);
  if (!response.ok) {
    throw new Error("게시글을 불러오지 못했습니다.");
  }

  const body = (await response.json()) as BoardListResult;
  return body;
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
    throw new Error("로그인이 필요합니다.");
  }

  const response = await fetch(`${apiBaseUrl}/boards/${boardId}/like`, {
    method,
    credentials: "include",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("로그인이 필요합니다.");
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
