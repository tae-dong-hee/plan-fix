import { createCourse, deleteCourse, fetchCourse, fetchMyCourses, fetchPublicCourses, updateCourse } from "./course";
import { UnauthorizedError } from "./spots";
import { setApiBaseUrl } from "@/test-utils/env";

describe("course service", () => {
  const originalEnv = import.meta.env.VITE_API_BASE_URL;

  beforeEach(() => {
    setApiBaseUrl("http://localhost:8080/api/v1");
    vi.resetAllMocks();
  });

  afterAll(() => {
    setApiBaseUrl(originalEnv);
  });

  describe("createCourse", () => {
    it("credentials: include와 payload를 전송하여 성공 응답을 반환한다", async () => {
      const mockCourse = {
        courseId: 1,
        title: "강릉 여행",
        days: [{ dayNumber: 1, spots: [] }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCourse,
      });

      const payload = {
        title: "강릉 여행",
        startDate: "2026-09-12",
        endDate: "2026-09-12",
        days: [{ dayNumber: 1, spots: [{ spotId: 10 }] }],
      };

      const result = await createCourse(payload);

      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockCourse);
    });

    it("401/403 응답 시 UnauthorizedError를 던진다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
      });

      await expect(
        createCourse({ title: "Test", days: [{ dayNumber: 1, spots: [] }] })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("fetchMyCourses", () => {
    it("내 코스 목록을 가져온다", async () => {
      const mockList = [{ courseId: 1, title: "코스 1" }];
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockList,
      });

      const result = await fetchMyCourses();
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/courses", {
        credentials: "include",
      });
      expect(result).toEqual(mockList);
    });

    it("401/403 응답 시 UnauthorizedError를 던진다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
      });

      await expect(fetchMyCourses()).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("fetchPublicCourses", () => {
    it("무작위 목록은 캐시를 사용하지 않고 매번 서버에서 가져온다", async () => {
      const firstList = { items: [{ courseId: 1 }], offset: 0, size: 20, totalCount: 2 };
      const nextList = { ...firstList, items: [{ courseId: 2 }] };
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => firstList })
        .mockResolvedValueOnce({ ok: true, json: async () => nextList });

      expect(await fetchPublicCourses({ sort: "random", size: 20 })).toEqual(firstList);
      expect(await fetchPublicCourses({ sort: "random", size: 20 })).toEqual(nextList);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenLastCalledWith(
        "http://localhost:8080/api/v1/courses/public?sort=random&offset=0&size=20",
        { credentials: "include", cache: "no-store" },
      );
    });

    it.each(["latest", "popular"] as const)("%s 목록의 정렬과 페이지 요청을 유지한다", async (sort) => {
      const list = { items: [], offset: 20, size: 10, totalCount: 0 };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => list });

      expect(await fetchPublicCourses({ sort, offset: 20, size: 10 })).toEqual(list);
      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:8080/api/v1/courses/public?sort=${sort}&offset=20&size=10`,
        { credentials: "include" },
      );
    });
  });

  describe("fetchCourse", () => {
    it("404 응답 시 null을 반환한다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      });

      const result = await fetchCourse(999);
      expect(result).toBeNull();
    });

    it("정상 응답 시 코스 정보를 반환한다", async () => {
      const mockCourse = { courseId: 1, title: "코스 1" };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCourse,
      });

      const result = await fetchCourse(1);
      expect(result).toEqual(mockCourse);
    });
  });

  describe("updateCourse", () => {
    it("PATCH 메서드로 수정 요청을 보내고 업데이트된 코스를 반환한다", async () => {
      const updatedCourse = { courseId: 1, title: "수정된 제목" };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => updatedCourse,
      });

      const payload = {
        title: "수정된 제목",
        days: [{ dayNumber: 1, spots: [{ spotId: 10 }] }],
      };

      const result = await updateCourse(1, payload);
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/courses/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(updatedCourse);
    });

    it("401/403 응답 시 UnauthorizedError를 던진다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 401,
        ok: false,
      });

      await expect(
        updateCourse(1, { title: "Title", days: [] })
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe("deleteCourse", () => {
    it("DELETE 메서드로 삭제 요청을 보내고 삭제된 코스 정보를 반환한다", async () => {
      const deletedCourse = { courseId: 1, status: "DELETED" };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => deletedCourse,
      });

      const result = await deleteCourse(1);
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8080/api/v1/courses/1", {
        method: "DELETE",
        credentials: "include",
      });
      expect(result).toEqual(deletedCourse);
    });

    it("401/403 응답 시 UnauthorizedError를 던진다", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 403,
        ok: false,
      });

      await expect(deleteCourse(1)).rejects.toThrow(UnauthorizedError);
    });
  });
});
