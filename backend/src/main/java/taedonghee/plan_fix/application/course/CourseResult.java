package taedonghee.plan_fix.application.course;

import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.spot.SpotModel;

import taedonghee.plan_fix.domain.course.CourseGenerationSource;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 코스 처리 결과
 */
public record CourseResult(
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
        CourseGenerationSource generatedBy,
        List<CourseTravelTheme> themes
) {
    public CourseResult(Long courseId, Long userId, String title, String description, String thumbnail,
                        CourseVisibility visibility, CourseStatus status, long viewCount, long likeCount,
                        LocalDate startDate, LocalDate endDate, List<Day> days,
                        OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        this(courseId, userId, title, description, thumbnail, visibility, status, viewCount, likeCount,
                startDate, endDate, days, createdAt, updatedAt, null, List.of());
    }

    /**
     * CourseModel과 SpotModel 맵을 응답용 결과 객체로 변환
     */
    public static CourseResult from(CourseModel course, Map<Long, SpotModel> spotsById) {
        return from(course, spotsById, null);
    }

    public static CourseResult from(CourseModel course, Map<Long, SpotModel> spotsById,
                                    Map<Long, String> thumbnails) {
        List<Day> dayResults = new ArrayList<>();
        for (CourseDayModel day : course.days()) {
            List<Spot> spotResults = new ArrayList<>();
            for (int seq = 0; seq < day.spots().size(); seq++) {
                CourseSpotModel spot = day.spots().get(seq);
                SpotModel spotInfo = spotsById != null ? spotsById.get(spot.spotId()) : null;

                spotResults.add(new Spot(
                        spot.spotId(),
                        seq,
                        spot.memo(),
                        spotInfo != null ? spotInfo.title() : null,
                        spotInfo != null ? spotInfo.category() : null,
                        spotInfo != null ? spotInfo.region() : null,
                        spotInfo != null ? spotInfo.sigungu() : null,
                        spotInfo != null ? spotInfo.address() : null,
                        thumbnails != null ? thumbnails.get(spot.spotId())
                                : spotInfo != null ? spotInfo.thumbnail() : null,
                        spotInfo != null ? spotInfo.latitude() : null,
                        spotInfo != null ? spotInfo.longitude() : null
                ));
            }
            dayResults.add(new Day(day.dayNumber(), spotResults));
        }

        return new CourseResult(
                course.courseId(),
                course.userId(),
                course.title(),
                course.description(),
                course.thumbnail(),
                course.visibility(),
                course.status(),
                course.viewCount(),
                course.likeCount(),
                course.startDate(),
                course.endDate(),
                dayResults,
                course.createdAt(),
                course.updatedAt(),
                course.generatedBy(),
                course.themes()
        );
    }

    /**
     * 코스의 일차(Day)별 spot 목록 응답
     */
    public record Day(int dayNumber, List<Spot> spots) {
    }

    /**
     * 코스에 포함된 spot 요약 응답 정보
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
    }
}
