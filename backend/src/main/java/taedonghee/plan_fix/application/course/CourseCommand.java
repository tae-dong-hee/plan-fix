package taedonghee.plan_fix.application.course;

import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.course.CourseGenerationSource;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;

import java.time.LocalDate;
import java.util.List;

/**
 * 코스 요청 Command
 */
public final class CourseCommand {

    private CourseCommand() {
    }

    /**
     * 코스 생성 요청 값
     */
    public record Create(
            String title,
            String description,
            String thumbnail,
            CourseVisibility visibility,
            LocalDate startDate,
            LocalDate endDate,
            List<CourseDayModel> days,
            CourseGenerationSource generatedBy,
            List<CourseTravelTheme> themes
    ) {
        public Create(String title, String description, String thumbnail, CourseVisibility visibility,
                      LocalDate startDate, LocalDate endDate, List<CourseDayModel> days) {
            this(title, description, thumbnail, visibility, startDate, endDate, days, null, null);
        }

    }

    /**
     * 코스 수정 요청 값
     */
    public record Update(
            String title,
            String description,
            String thumbnail,
            CourseVisibility visibility,
            LocalDate startDate,
            LocalDate endDate,
            List<CourseDayModel> days,
            CourseGenerationSource generatedBy,
            List<CourseTravelTheme> themes
    ) {
        public Update(String title, String description, String thumbnail, CourseVisibility visibility,
                      LocalDate startDate, LocalDate endDate, List<CourseDayModel> days) {
            this(title, description, thumbnail, visibility, startDate, endDate, days, null, null);
        }

    }
}
