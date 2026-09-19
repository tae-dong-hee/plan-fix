export const MAX_STORY_PHOTOS = 6;
export const MAX_STORY_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_STORY_TOTAL_BYTES = 15 * 1024 * 1024;

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const AI_UNAVAILABLE_MESSAGE = "지금은 AI 글쓰기를 이용할 수 없습니다. 잠시 후 다시 시도하거나 직접 작성해 주세요.";
const INVALID_DRAFT_MESSAGE = "AI가 본문을 완성하지 못했습니다. 다시 시도해 주세요.";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

export type BoardDraftRequest = {
  files: File[];
  title?: string;
  note?: string;
  courseId?: number;
  visitedSpotIds?: number[];
};

export type BoardDraft = {
  content: string;
};

/** 생성에 사용할 전체 사진 목록을 검사한다. 서버에서도 같은 제한을 검증한다. */
export function validateStoryPhotos(files: File[]): string | null {
  if (files.length === 0) return "여행 사진을 1장 이상 추가해 주세요.";
  if (files.length > MAX_STORY_PHOTOS) return "사진은 최대 6장까지 추가할 수 있습니다.";
  if (files.some((file) => !PHOTO_TYPES.has(file.type))) return "JPG, PNG, WebP 사진만 추가할 수 있습니다.";
  if (files.some((file) => file.size === 0)) return "비어 있는 사진 파일은 사용할 수 없습니다. 다른 사진을 선택해 주세요.";
  if (files.some((file) => file.size > MAX_STORY_PHOTO_BYTES)) return "사진 한 장의 크기는 5MB 이하여야 합니다.";
  if (files.reduce((total, file) => total + file.size, 0) > MAX_STORY_TOTAL_BYTES) return "사진의 전체 크기는 15MB 이하여야 합니다.";
  return null;
}

/** 사진을 바탕으로 편집 가능한 본문 초안만 생성하며 게시글을 저장하지 않는다. */
export async function generateBoardDraft(request: BoardDraftRequest, signal?: AbortSignal): Promise<BoardDraft> {
  const validationError = validateStoryPhotos(request.files);
  if (validationError) throw new Error(validationError);
  if (request.courseId !== undefined && !isPositiveId(request.courseId)) {
    throw new Error("여행 코스를 다시 선택해 주세요.");
  }
  const visitedSpotIds = request.visitedSpotIds === undefined ? [] : request.visitedSpotIds;
  if (!Array.isArray(visitedSpotIds) || visitedSpotIds.length > 20
    || visitedSpotIds.some((id) => !isPositiveId(id))
    || new Set(visitedSpotIds).size !== visitedSpotIds.length) {
    throw new Error("다녀온 장소는 중복 없이 최대 20곳까지 선택해 주세요.");
  }
  if (visitedSpotIds.length > 0 && request.courseId === undefined) {
    throw new Error("다녀온 장소를 선택하려면 여행 코스를 먼저 선택해 주세요.");
  }
  if (!apiBaseUrl) throw new Error(AI_UNAVAILABLE_MESSAGE);

  const body = new FormData();
  request.files.forEach((file) => body.append("files", file));
  if (request.title?.trim()) body.append("title", request.title.trim());
  if (request.note?.trim()) body.append("note", request.note.trim());
  if (request.courseId !== undefined) body.append("courseId", String(request.courseId));
  visitedSpotIds.forEach((id) => body.append("visitedSpotIds", String(id)));

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/boards/ai-draft`, {
      method: "POST",
      credentials: "include",
      body,
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error("사진을 전송하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error("AI 글쓰기를 이용하려면 로그인이 필요합니다.");
  }
  if (response.status === 413) {
    throw new Error("사진 용량이 너무 큽니다. 한 장은 5MB, 전체는 15MB 이하로 올려 주세요.");
  }

  const result: unknown = await response.json().catch((error: unknown) => {
    if (isAbortError(error)) throw error;
    return null;
  });

  if (!response.ok) {
    const message = isRecord(result) && typeof result.message === "string" ? result.message.trim() : "";
    if (message) throw new Error(message);
    if (response.status === 429) throw new Error("AI 글쓰기 요청이 많습니다. 잠시 후 다시 시도해 주세요.");
    throw new Error(AI_UNAVAILABLE_MESSAGE);
  }

  if (!isRecord(result) || typeof result.content !== "string" || !result.content.trim()) {
    throw new Error(INVALID_DRAFT_MESSAGE);
  }
  return { content: result.content.trim() };
}

function isPositiveId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
