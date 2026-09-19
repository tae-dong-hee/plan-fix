import { setApiBaseUrl } from "@/test-utils/env";
import { MAX_STORY_PHOTO_BYTES, MAX_STORY_TOTAL_BYTES, validateStoryPhotos } from "./board-ai";
import type { BoardDraftRequest } from "./board-ai";

function photo(name = "trip.jpg", type = "image/jpeg", size = 10): File {
  const file = new File(["photo"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("validateStoryPhotos", () => {
  test("JPEG, PNG, WebP 여섯 장과 장별·전체 용량 경계를 허용한다", () => {
    expect(validateStoryPhotos([
      photo(), photo("trip.png", "image/png"), photo("trip.webp", "image/webp"),
      photo(), photo(), photo(),
    ])).toBeNull();
    expect(validateStoryPhotos(Array.from({ length: 3 }, () => photo("trip.jpg", "image/jpeg", MAX_STORY_PHOTO_BYTES)))).toBeNull();
  });

  test.each([
    [[], "여행 사진을 1장 이상"],
    [Array.from({ length: 7 }, () => photo()), "최대 6장"],
    [[photo("trip.gif", "image/gif")], "JPG, PNG, WebP"],
    [[photo("trip.jpg", "")], "JPG, PNG, WebP"],
    [[photo("empty.jpg", "image/jpeg", 0)], "비어 있는 사진"],
    [[photo("large.jpg", "image/jpeg", MAX_STORY_PHOTO_BYTES + 1)], "한 장의 크기는 5MB"],
    [[photo("a.jpg", "image/jpeg", MAX_STORY_PHOTO_BYTES), photo("b.jpg", "image/jpeg", MAX_STORY_PHOTO_BYTES), photo("c.jpg", "image/jpeg", MAX_STORY_TOTAL_BYTES - 2 * MAX_STORY_PHOTO_BYTES), photo()], "전체 크기는 15MB"],
  ])("잘못된 사진 목록을 거절한다: %s", (files, message) => {
    expect(validateStoryPhotos(files as File[])).toContain(message);
  });
});

describe("generateBoardDraft", () => {
  const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    setApiBaseUrl("http://localhost:8080/api/v1/");
    vi.resetModules();
  });

  afterEach(() => {
    setApiBaseUrl(originalApiBaseUrl);
    global.fetch = originalFetch;
    vi.resetModules();
  });

  test("사진 순서, 선택 입력, 인증 쿠키와 취소 신호를 multipart 요청으로 전달한다", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: "  바다를 보며 걸었다.\n즐거운 여행이었다.  " }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");
    const files = [photo("beach.jpg"), photo("cafe.png", "image/png")];
    const controller = new AbortController();

    await expect(generateBoardDraft({ files, title: " 강릉 여행 ", note: " 친구와 다녀왔어요. " }, controller.signal)).resolves.toEqual({ content: "바다를 보며 걸었다.\n즐거운 여행이었다." });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8080/api/v1/boards/ai-draft");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
    expect(options.signal).toBe(controller.signal);
    expect(options.headers).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    const form = options.body as FormData;
    expect(form.getAll("files")).toEqual(files);
    expect(form.get("title")).toBe("강릉 여행");
    expect(form.get("note")).toBe("친구와 다녀왔어요.");
  });

  test("빈 선택 입력은 보내지 않는다", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: "여행 이야기" }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await generateBoardDraft({ files: [photo()], title: " ", note: "\n" });

    const form = (fetchSpy.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.has("title")).toBe(false);
    expect(form.has("note")).toBe(false);
    expect(form.has("courseId")).toBe(false);
    expect(form.has("visitedSpotIds")).toBe(false);
  });

  test("코스와 확인한 장소 ID를 multipart 필드로 전달한다", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: "춘천에서 보낸 2박 3일." }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");
    const visitedSpotIds = Array.from({ length: 20 }, (_, index) => index + 1);

    await generateBoardDraft({ files: [photo()], courseId: 42, visitedSpotIds });

    const form = (fetchSpy.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.get("courseId")).toBe("42");
    expect(form.getAll("visitedSpotIds")).toEqual(visitedSpotIds.map(String));
  });

  test.each([undefined, 42])("확인한 장소가 없으면 장소 ID를 생략한다 (courseId=%s)", async (courseId) => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: "여행 이야기" }) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await generateBoardDraft({ files: [photo()], courseId, visitedSpotIds: [] });

    const form = (fetchSpy.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.get("courseId")).toBe(courseId === undefined ? null : String(courseId));
    expect(form.has("visitedSpotIds")).toBe(false);
  });

  test.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "42", null])("잘못된 코스 ID는 전송 전에 거절한다: %s", async (courseId) => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()], courseId } as BoardDraftRequest)).rejects.toThrow("여행 코스를 다시 선택");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each([
    [0], [-1], [1.5], [NaN], [Infinity], [Number.MAX_SAFE_INTEGER + 1], ["1"], [1, 1],
    Array.from({ length: 21 }, (_, index) => index + 1),
  ])("잘못된 장소 ID 목록은 전송 전에 거절한다: %j", async (...visitedSpotIds) => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()], courseId: 42, visitedSpotIds } as BoardDraftRequest)).rejects.toThrow("중복 없이 최대 20곳");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("여행 코스 없이 장소 ID만 보내지 않는다", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()], visitedSpotIds: [1] })).rejects.toThrow("여행 코스를 먼저 선택");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("유효하지 않은 사진은 전송 전에 거절한다", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [] })).rejects.toThrow("여행 사진을 1장 이상");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("API가 설정되지 않으면 가짜 본문 없이 사용 불가를 알린다", async () => {
    setApiBaseUrl(undefined);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()] })).rejects.toThrow("지금은 AI 글쓰기를 이용할 수 없습니다.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each([
    [401, "로그인이 필요합니다"],
    [403, "로그인이 필요합니다"],
    [413, "사진 용량이 너무 큽니다"],
    [429, "요청이 많습니다"],
    [503, "지금은 AI 글쓰기를 이용할 수 없습니다"],
  ])("%i 상태를 한국어 안내로 전달한다", async (status, message) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({}) }) as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()] })).rejects.toThrow(message);
  });

  test("서버 JSON의 message를 그대로 전달한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "사진을 읽을 수 없습니다. 다른 사진으로 시도해 주세요." }) }) as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()] })).rejects.toThrow("사진을 읽을 수 없습니다. 다른 사진으로 시도해 주세요.");
  });

  test.each([null, [], {}, { content: null }, { content: 7 }, { content: " \n " }])("잘못된 성공 응답을 본문에 넣지 않는다: %j", async (result) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => result }) as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()] })).rejects.toThrow("AI가 본문을 완성하지 못했습니다");
  });

  test.each([true, false])("JSON이 아닌 응답도 사용자에게 읽을 수 있는 오류를 전달한다 (ok=%s)", async (ok) => {
    global.fetch = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 502, json: async () => { throw new SyntaxError("Unexpected token <"); } }) as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()] })).rejects.toThrow(ok ? "AI가 본문을 완성하지 못했습니다" : "지금은 AI 글쓰기를 이용할 수 없습니다");
  });

  test("네트워크 실패를 한국어로 안내한다", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()] })).rejects.toThrow("인터넷 연결을 확인");
  });

  test.each(["fetch", "body"])("%s에서 발생한 취소 오류는 보존한다", async (stage) => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    global.fetch = (stage === "fetch"
      ? vi.fn().mockRejectedValue(abortError)
      : vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw abortError; } })) as unknown as typeof fetch;
    const { generateBoardDraft } = await import("./board-ai");

    await expect(generateBoardDraft({ files: [photo()] })).rejects.toBe(abortError);
  });
});
