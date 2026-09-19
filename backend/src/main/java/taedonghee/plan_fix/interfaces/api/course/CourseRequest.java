package taedonghee.plan_fix.interfaces.api.course;

import taedonghee.plan_fix.application.course.CourseCommand;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.course.CourseGenerationSource;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;
import taedonghee.plan_fix.domain.course.CourseTripIdea;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * 코스 API 요청 DTO
 */
public final class CourseRequest {

    private CourseRequest() {
    }

    /**
     * 코스 생성 요청
     */
    public record Create(
            String title,
            String description,
            String thumbnail,
            CourseVisibility visibility,
            LocalDate startDate,
            LocalDate endDate,
            List<Day> days,
            CourseGenerationSource generatedBy,
            List<CourseTravelTheme> themes
    ) {
        public Create(String title, String description, String thumbnail, CourseVisibility visibility,
                      LocalDate startDate, LocalDate endDate, List<Day> days) {
            this(title, description, thumbnail, visibility, startDate, endDate, days, null, null);
        }

            /**
         * HTTP 요청 DTO를 Application Command로 변환
         */
        public CourseCommand.Create toCommand() {
            return new CourseCommand.Create(title, description, thumbnail, visibility, startDate, endDate,
                    toDayModels(days), generatedBy, themes);
        }
    }

    /**
     * 코스 수정 요청
     */
    public record Update(
            String title,
            String description,
            String thumbnail,
            CourseVisibility visibility,
            LocalDate startDate,
            LocalDate endDate,
            List<Day> days,
            CourseGenerationSource generatedBy,
            List<CourseTravelTheme> themes,
            OffsetDateTime expectedUpdatedAt
    ) {
        public Update(String title, String description, String thumbnail, CourseVisibility visibility,
                      LocalDate startDate, LocalDate endDate, List<Day> days) {
            this(title, description, thumbnail, visibility, startDate, endDate, days, null, null, null);
        }

        public Update(String title, String description, String thumbnail, CourseVisibility visibility,
                      LocalDate startDate, LocalDate endDate, List<Day> days,
                      CourseGenerationSource generatedBy, List<CourseTravelTheme> themes) {
            this(title, description, thumbnail, visibility, startDate, endDate, days, generatedBy, themes, null);
        }

        /**
         * HTTP 요청 DTO를 Application Command로 변환
         */
        public CourseCommand.Update toCommand() {
            return new CourseCommand.Update(title, description, thumbnail, visibility, startDate, endDate,
                    toDayModels(days), generatedBy, themes);
        }
    }

    /**
     * 코스에 포함할 일차(Day) 요청 값
     */
    public record Day(int dayNumber, List<Spot> spots,
                      List<CourseTravelTheme> themes, List<CourseTripIdea> tripIdeas) {
        public Day(int dayNumber, List<Spot> spots) {
            this(dayNumber, spots, null, null);
        }
    }

    /**
     * 코스에 포함할 spot 요청 값
     */
    public record Spot(Long spotId, String memo) {
    }

    /**
     * 요청 Day 목록을 도메인 값 객체로 변환
     */
    private static List<CourseDayModel> toDayModels(List<Day> days) {
        if (days == null) {
            return null;
        }
        return days.stream()
                .map(day -> day == null ? null : new CourseDayModel(day.dayNumber(), toSpotModels(day.spots()),
                        day.themes(), day.tripIdeas()))
                .toList();
    }

    /**
     * 요청 spot 목록을 도메인 값 객체로 변환
     */
    private static List<CourseSpotModel> toSpotModels(List<Spot> spots) {
        if (spots == null) {
            return null;
        }
        return spots.stream()
                .map(spot -> spot == null ? null : new CourseSpotModel(spot.spotId(), spot.memo()))
                .toList();
    }
}
