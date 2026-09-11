package taedonghee.plan_fix.application.course;

import taedonghee.plan_fix.domain.course.CourseModel;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** 공개 코스 목록 조회 결과. */
public record CourseListResult(List<Item> items, int offset, int size, long totalCount) {

    public record Item(
            Long courseId,
            Long userId,
            String title,
            String description,
            String thumbnail,
            long viewCount,
            long likeCount,
            int dayCount,
            int spotCount,
            LocalDate startDate,
            LocalDate endDate,
            OffsetDateTime createdAt
    ) {
        public static Item from(CourseModel course) {
            return from(course, course.thumbnail());
        }

        public static Item from(CourseModel course, String displayThumbnail) {
            int spotCount = course.days().stream().mapToInt(day -> day.spots().size()).sum();
            return new Item(course.courseId(), course.userId(), course.title(), course.description(),
                    displayThumbnail, course.viewCount(), course.likeCount(), course.days().size(), spotCount,
                    course.startDate(), course.endDate(), course.createdAt());
        }
    }
}
