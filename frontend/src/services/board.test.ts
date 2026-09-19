import { setApiBaseUrl } from "@/test-utils/env";

type BoardService = typeof import("./board");

describe("createBoard", () => {
  const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    vi.resetModules();
  });

  afterEach(() => {
    setApiBaseUrl(originalApiBaseUrl);
    global.fetch = originalFetch;
    vi.resetModules();
  });

  test.each([
    { status: 400, message: "나만 보기 코스는 여행 이야기에 연결할 수 없습니다. 코스를 전체 공개로 변경한 뒤 다시 연결해 주세요." },
    { status: 403, message: "본인의 코스만 여행 이야기에 연결할 수 있습니다." },
  ])("$status 오류의 안내 문구를 JSON 본문이나 로그인 오류로 바꾸지 않는다", async ({ status, message }) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status, text: async () => JSON.stringify({ status, message }) }) as unknown as typeof fetch;
    const { createBoard } = await import("./board");

    await expect(createBoard({ title: "여행 후기", content: "여행 기록", courseId: 1 })).rejects.toEqual(new Error(message));
  });

  test.each([
    { status: 401, text: "", message: "로그인이 필요합니다." },
    { status: 403, text: "", message: "게시글을 작성할 권한이 없습니다." },
    { status: 400, text: "잘못된 코스", message: "잘못된 코스" },
    { status: 500, text: "{}", message: "게시글 저장에 실패했습니다." },
  ])("$status 응답에 맞는 기본 오류 안내를 반환한다", async ({ status, text, message }) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status, text: async () => text }) as unknown as typeof fetch;
    const { createBoard } = await import("./board");

    await expect(createBoard({ title: "여행 후기", content: "여행 기록" })).rejects.toThrow(message);
  });
});

describe.each([
  {
    action: "등록",
    method: "POST",
    path: "/boards/1/comments",
    body: { content: "댓글", parentCommentId: null },
    call: (service: BoardService) => service.createBoardComment(1, "댓글"),
  },
  {
    action: "수정",
    method: "PATCH",
    path: "/boards/1/comments/2",
    body: { content: "수정한 댓글" },
    call: (service: BoardService) => service.updateBoardComment(1, 2, "수정한 댓글"),
  },
  {
    action: "삭제",
    method: "DELETE",
    path: "/boards/1/comments/2",
    body: undefined,
    call: (service: BoardService) => service.deleteBoardComment(1, 2),
  },
])("댓글 $action", ({ action, method, path, body, call }) => {
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

  test("인증 쿠키와 요청 본문을 보내고 성공 응답을 처리한다", async () => {
    const comment = { commentId: 2, content: body?.content };
    const json = vi.fn().mockResolvedValue(comment);
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: method === "DELETE" ? 204 : 200, json });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const service = await import("./board");

    expect(await call(service)).toEqual(method === "DELETE" ? undefined : comment);
    expect(fetchSpy).toHaveBeenCalledWith(`http://localhost:8080/api/v1${path}`, {
      method,
      credentials: "include",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    expect(json).toHaveBeenCalledTimes(method === "DELETE" ? 0 : 1);
  });

  test.each([
    { status: 401, text: "", message: "로그인이 필요합니다. 다시 로그인해주세요." },
    { status: 403, text: "Forbidden", message: `댓글을 ${action}할 권한이 없습니다.` },
    { status: 403, text: "Invalid CORS request\n", message: "접속 주소가 변경되었습니다. 페이지를 새로고침한 뒤 다시 로그인해주세요." },
    { status: 500, text: "Internal Server Error", message: `댓글을 ${action}하지 못했습니다.` },
  ])("$status 응답 $text에 맞는 안내를 반환한다", async ({ status, text, message }) => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status, text: async () => text }) as unknown as typeof fetch;
    const service = await import("./board");

    await expect(call(service)).rejects.toThrow(message);
  });

  test("403 응답 본문을 읽지 못해도 권한 안내를 반환한다", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403, text: vi.fn().mockRejectedValue(new Error("read failed")) }) as unknown as typeof fetch;
    const service = await import("./board");

    await expect(call(service)).rejects.toThrow(`댓글을 ${action}할 권한이 없습니다.`);
  });

  test("API 주소가 없으면 잘못된 주소로 요청하지 않는다", async () => {
    setApiBaseUrl(undefined);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const service = await import("./board");

    await expect(call(service)).rejects.toThrow("API URL이 설정되지 않았습니다.");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  if (method === "POST") {
    test("대댓글은 부모 댓글 ID를 본문에 포함한다", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ commentId: 3, parentCommentId: 2 }) });
      global.fetch = fetchSpy as unknown as typeof fetch;
      const { createBoardComment } = await import("./board");

      await createBoardComment(1, "대댓글", 2);

      expect(fetchSpy).toHaveBeenCalledWith("http://localhost:8080/api/v1/boards/1/comments", expect.objectContaining({
        body: JSON.stringify({ content: "대댓글", parentCommentId: 2 }),
      }));
    });
  }
});

describe("fetchBoards", () => {
  const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    setApiBaseUrl(originalApiBaseUrl);
    global.fetch = originalFetch;
    vi.resetModules();
  });

  test.each(["popular", "latest"] as const)("%s 정렬과 페이지 범위를 서버에 전달하고 응답 순서를 유지한다", async (sort) => {
    setApiBaseUrl("http://localhost:8080/api/v1/");
    const result = {
      items: [
        { boardId: 201, title: "첫 번째 이야기", thumbnail: null, userId: 1, likeCount: 1, viewCount: 20, commentCount: 0, createdAt: "2026-09-19T10:00:00Z" },
        { boardId: 101, title: "두 번째 이야기", thumbnail: null, userId: 2, likeCount: 50, viewCount: 100, commentCount: 5, createdAt: "2026-09-18T10:00:00Z" },
      ],
      offset: 12,
      size: 6,
      totalCount: 30,
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchBoards } = await import("./board");

    expect(await fetchBoards({ sort, size: 6, offset: 12 })).toEqual(result);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe("http://localhost:8080/api/v1/boards");
    expect(calledUrl.searchParams.get("sort")).toBe(sort);
    expect(calledUrl.searchParams.get("size")).toBe("6");
    expect(calledUrl.searchParams.get("offset")).toBe("12");
  });

  test("정렬을 생략하면 인기순으로 여섯 개를 요청한다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], offset: 0, size: 6, totalCount: 0 }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchBoards } = await import("./board");

    await fetchBoards();

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("sort")).toBe("popular");
    expect(calledUrl.searchParams.get("size")).toBe("6");
  });

  test("API 주소가 없으면 최신순도 요청한 페이지 범위의 빈 목록을 반환한다", async () => {
    setApiBaseUrl(undefined);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchBoards } = await import("./board");

    expect(await fetchBoards({ sort: "latest", offset: 12, size: 3 })).toEqual({
      items: [], offset: 12, size: 3, totalCount: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("fetchPopularBoards", () => {
  const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    setApiBaseUrl(originalApiBaseUrl);
    global.fetch = originalFetch;
    vi.resetModules();
  });

  test("VITE_API_BASE_URL이 없으면 빈 목록을 반환하고 fetch를 호출하지 않는다", async () => {
    setApiBaseUrl(undefined);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchPopularBoards } = (await import("./board")) as typeof import("./board");

    const result = await fetchPopularBoards();

    expect(result).toEqual({ items: [], offset: 0, size: 6, totalCount: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("sort=popular와 size를 쿼리에 담아 호출하고 결과를 반환한다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const items = [
      {
        boardId: 1,
        title: "강릉 당일치기 여행 코스 공유",
        thumbnail: "https://example.com/board1.jpg",
        userId: 10,
        likeCount: 15,
        viewCount: 120,
        commentCount: 4,
        createdAt: "2026-09-01T12:00:00Z",
      },
    ];
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items, offset: 0, size: 6, totalCount: 1 }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchPopularBoards } = (await import("./board")) as typeof import("./board");

    const result = await fetchPopularBoards({ size: 6 });

    expect(result).toEqual({ items, offset: 0, size: 6, totalCount: 1 });
    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe("http://localhost:8080/api/v1/boards");
    expect(calledUrl.searchParams.get("sort")).toBe("popular");
    expect(calledUrl.searchParams.get("size")).toBe("6");
  });

  test("size를 지정하지 않으면 기본값 6을 쓴다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], offset: 0, size: 6, totalCount: 0 }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchPopularBoards } = (await import("./board")) as typeof import("./board");

    await fetchPopularBoards();

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("sort")).toBe("popular");
    expect(calledUrl.searchParams.get("size")).toBe("6");
  });

  test("offset 파라미터가 주어지면 쿼리에 offset을 포함한다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], offset: 12, size: 6, totalCount: 0 }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchPopularBoards } = (await import("./board")) as typeof import("./board");

    await fetchPopularBoards({ offset: 12, size: 6 });

    const calledUrl = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(calledUrl.searchParams.get("offset")).toBe("12");
    expect(calledUrl.searchParams.get("size")).toBe("6");
  });

  test("응답이 실패(ok=false)면 에러를 던진다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchPopularBoards } = (await import("./board")) as typeof import("./board");

    await expect(fetchPopularBoards()).rejects.toThrow("게시글을 불러오지 못했습니다.");
  });
});

describe("fetchBoardDetail", () => {
  const originalApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  const originalFetch = global.fetch;

  afterEach(() => {
    setApiBaseUrl(originalApiBaseUrl);
    global.fetch = originalFetch;
    vi.resetModules();
  });

  test("VITE_API_BASE_URL이 없으면 null을 반환하고 fetch를 호출하지 않는다", async () => {
    setApiBaseUrl(undefined);
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchBoardDetail } = (await import("./board")) as typeof import("./board");

    const result = await fetchBoardDetail(1);

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("정상 응답이면 상세 정보를 그대로 반환한다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const detail = {
      boardId: 1,
      courseId: null,
      userId: 10,
      title: "강릉 카페 투어 완벽 가이드",
      content: "<p>강릉의 최고 카페들을 소개합니다.</p>",
      thumbnail: "https://example.com/thumb.jpg",
      status: "PUBLISHED",
      viewCount: 150,
      likeCount: 25,
      commentCount: 8,
      images: [
        { imageUrl: "https://example.com/cafe1.jpg", altText: "카페 1", sequence: 1 },
      ],
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-01T10:00:00Z",
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => detail });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchBoardDetail } = (await import("./board")) as typeof import("./board");

    const result = await fetchBoardDetail(1);

    expect(result).toEqual(detail);
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:8080/api/v1/boards/1", {
      credentials: "include",
    });
  });

  test("404면 null을 반환한다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchBoardDetail } = (await import("./board")) as typeof import("./board");

    const result = await fetchBoardDetail(999);

    expect(result).toBeNull();
  });

  test("404가 아닌 실패면 에러를 던진다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { fetchBoardDetail } = (await import("./board")) as typeof import("./board");

    await expect(fetchBoardDetail(1)).rejects.toThrow("게시글을 불러오지 못했습니다.");
  });

  test("likeBoard는 POST 요청을 보내고 결과를 반환한다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ liked: true, likeCount: 5 }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { likeBoard } = (await import("./board")) as typeof import("./board");

    const res = await likeBoard(1);
    expect(res).toEqual({ liked: true, likeCount: 5 });
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:8080/api/v1/boards/1/like", {
      method: "POST",
      credentials: "include",
    });
  });

  test("unlikeBoard는 DELETE 요청을 보내고 결과를 반환한다", async () => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ liked: false, likeCount: 4 }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    vi.resetModules();
    const { unlikeBoard } = (await import("./board")) as typeof import("./board");

    const res = await unlikeBoard(1);
    expect(res).toEqual({ liked: false, likeCount: 4 });
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:8080/api/v1/boards/1/like", {
      method: "DELETE",
      credentials: "include",
    });
  });
});
