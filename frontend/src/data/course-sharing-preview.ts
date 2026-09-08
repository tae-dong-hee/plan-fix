import type { CourseResponse } from "@/services/course";

export type CourseSharingPreviewState = {
  previewCourse?: CourseResponse;
  previewPermission?: "VIEWER" | "EDITOR";
};

// 화면을 직접 열어도 프론트엔드만으로 볼 수 있는 예시입니다. 실제 코스가 아닙니다.
export const sampleSharingCourse: CourseResponse = {
  courseId: 0,
  userId: 0,
  title: "함께 떠나는 강릉 바다 여행",
  description: "바다를 따라 걷고, 커피 한 잔과 함께 여유를 즐기는 여행이에요.",
  thumbnail: "/travel-guides/random-01.jpg",
  visibility: "PRIVATE",
  status: "ACTIVE",
  viewCount: 0,
  likeCount: 0,
  startDate: "2026-09-19",
  endDate: "2026-09-20",
  createdAt: "2026-09-09T00:00:00Z",
  updatedAt: "2026-09-09T00:00:00Z",
  days: [
    { dayNumber: 1, spots: [
      { spotId: 1, sequence: 0, title: "경포해변", category: "관광지", region: "강원", sigungu: "강릉", address: "강원특별자치도 강릉시", thumbnail: null, latitude: null, longitude: null, memo: "바닷가를 천천히 걸으며 사진 남기기" },
      { spotId: 2, sequence: 1, title: "안목 커피거리", category: "카페", region: "강원", sigungu: "강릉", address: "강원특별자치도 강릉시", thumbnail: null, latitude: null, longitude: null, memo: "좋아하는 커피 한 잔과 함께 쉬어가기" },
    ] },
    { dayNumber: 2, spots: [
      { spotId: 3, sequence: 0, title: "경포호 산책길", category: "산책", region: "강원", sigungu: "강릉", address: "강원특별자치도 강릉시", thumbnail: null, latitude: null, longitude: null, memo: "호수를 둘러보며 여유롭게 여행 마무리하기" },
    ] },
  ],
};

const optionalText = (value: unknown) => value == null || typeof value === "string";

export function isSharingPreviewCourse(value: unknown): value is CourseResponse {
  if (!value || typeof value !== "object") return false;
  const course = value as Partial<CourseResponse>;
  return typeof course.courseId === "number" && typeof course.title === "string" && Boolean(course.title.trim())
    && optionalText(course.description) && optionalText(course.thumbnail)
    && optionalText(course.startDate) && optionalText(course.endDate)
    && Array.isArray(course.days) && course.days.every((day) => day && typeof day.dayNumber === "number"
      && Array.isArray(day.spots) && day.spots.every((spot) => spot && typeof spot.spotId === "number"
        && typeof spot.sequence === "number" && typeof spot.title === "string"
        && optionalText(spot.thumbnail) && optionalText(spot.address) && optionalText(spot.memo)));
}
