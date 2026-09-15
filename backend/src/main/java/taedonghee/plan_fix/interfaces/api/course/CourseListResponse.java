package taedonghee.plan_fix.interfaces.api.course;

import taedonghee.plan_fix.application.course.CourseListResult;

import taedonghee.plan_fix.domain.course.CourseGenerationSource;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** 공개 코스 목록 조회 응답. */
public record CourseListResponse(List<Item> items, int offset, int size, long totalCount) {

    public static CourseListResponse from(CourseListResult result) {
        return new CourseListResponse(result.items().stream().map(Item::from).toList(),
                result.offset(), result.size(), result.totalCount());
    }

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
            OffsetDateTime createdAt,
            CourseGenerationSource generatedBy,
            List<CourseTravelTheme> themes
    ) {
        public static Item from(CourseListResult.Item item) {
            return new Item(item.courseId(), item.userId(), item.title(), item.description(), item.thumbnail(),
                    item.viewCount(), item.likeCount(), item.dayCount(), item.spotCount(), item.startDate(),
                    item.endDate(), item.createdAt(), item.generatedBy(), item.themes());
        }
    }
}
