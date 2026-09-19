package taedonghee.plan_fix.interfaces.api.course;

import taedonghee.plan_fix.application.course.CourseResult;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;

import taedonghee.plan_fix.domain.course.CourseGenerationSource;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;
import taedonghee.plan_fix.domain.course.CourseTripIdea;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 코스 API 응답 DTO
 */
public record CourseResponse(
        Long courseId,
        Long userId,
        String title,
        String description,
        String thumbnail,
        CourseVisibility visibility,
        CourseStatus status,
        long viewCount,
        long likeCount,
        LocalDate startDate,
        LocalDate endDate,
        List<Day> days,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        boolean isOwner,
        CourseGenerationSource generatedBy,
        List<CourseTravelTheme> themes,
        boolean canEdit
) {
    public CourseResponse(
            Long courseId, Long userId, String title, String description, String thumbnail,
            CourseVisibility visibility, CourseStatus status, long viewCount, long likeCount,
            LocalDate startDate, LocalDate endDate, List<Day> days, OffsetDateTime createdAt, OffsetDateTime updatedAt
    ) {
        this(courseId, userId, title, description, thumbnail, visibility, status, viewCount, likeCount, startDate, endDate, days, createdAt, updatedAt, false, null, List.of(), false);
    }

    public CourseResponse(Long courseId, Long userId, String title, String description, String thumbnail,
                          CourseVisibility visibility, CourseStatus status, long viewCount, long likeCount,
                          LocalDate startDate, LocalDate endDate, List<Day> days,
                          OffsetDateTime createdAt, OffsetDateTime updatedAt, boolean isOwner) {
        this(courseId, userId, title, description, thumbnail, visibility, status, viewCount, likeCount,
                startDate, endDate, days, createdAt, updatedAt, isOwner, null, List.of(), isOwner);
    }

    /**
     * Application Result를 HTTP 응답 DTO로 변환
     */
    public static CourseResponse from(CourseResult result) {
        return from(result, null);
    }

    /**
     * 요청자 ID를 기반으로 isOwner를 판별하여 응답 DTO로 변환
     */
    public static CourseResponse from(CourseResult result, Long requesterId) {
        return from(result, requesterId, requesterId != null && requesterId.equals(result.userId()));
    }

    public static CourseResponse from(CourseResult result, Long requesterId, boolean canEdit) {
        boolean isOwner = requesterId != null && requesterId.equals(result.userId());
        return new CourseResponse(
                result.courseId(),
                result.userId(),
                result.title(),
                result.description(),
                result.thumbnail(),
                result.visibility(),
                result.status(),
                result.viewCount(),
                result.likeCount(),
                result.startDate(),
                result.endDate(),
                result.days().stream().map(Day::from).toList(),
                result.createdAt(),
                result.updatedAt(),
                isOwner,
                result.generatedBy(),
                result.themes(),
                canEdit
        );
    }

    /**
     * 코스의 일차(Day)별 spot 목록 응답
     */
    public record Day(int dayNumber, List<Spot> spots,
                      List<CourseTravelTheme> themes, List<CourseTripIdea> tripIdeas) {
        public Day(int dayNumber, List<Spot> spots) {
            this(dayNumber, spots, List.of(), List.of());
        }

        public static Day from(CourseResult.Day day) {
            return new Day(day.dayNumber(), day.spots().stream().map(Spot::from).toList(), day.themes(), day.tripIdeas());
        }
    }

    /**
     * 코스에 포함된 spot 응답 값
     */
    public record Spot(
            Long spotId,
            int sequence,
            String memo,
            String title,
            String category,
            String region,
            String sigungu,
            String address,
            String thumbnail,
            BigDecimal latitude,
            BigDecimal longitude
    ) {
        public static Spot from(CourseResult.Spot spot) {
            return new Spot(
                    spot.spotId(),
                    spot.sequence(),
                    spot.memo(),
                    spot.title(),
                    spot.category(),
                    spot.region(),
                    spot.sigungu(),
                    spot.address(),
                    spot.thumbnail(),
                    spot.latitude(),
                    spot.longitude()
            );
        }
    }
}
