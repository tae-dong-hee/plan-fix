package taedonghee.plan_fix.application.course.ai;

import java.time.LocalDate;
import java.util.List;
import java.util.Comparator;
import java.util.HashSet;
import java.time.temporal.ChronoUnit;
import taedonghee.plan_fix.domain.course.CourseDayTheme;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

/**
 * [application] AI 코스 초안 생성 요청.
 *
 * 기간은 코스 생성 화면에서 이미 고른 값을 그대로 넘겨받는다(다시 묻지 않는다).
 */
public record AiCourseCommand(
	String region,
	String sigungu,
	LocalDate startDate,
	LocalDate endDate,
	List<CourseTheme> themes,
	CourseCompanion companion,
	/** 사용자가 "꼭 가고 싶다"고 고정한 장소. 비어 있어도 된다. */
	List<Long> anchorSpotIds,
	List<CourseDayTheme> dayThemes
) {
	public AiCourseCommand(String region, String sigungu, LocalDate startDate, LocalDate endDate,
		List<CourseTheme> themes, CourseCompanion companion, List<Long> anchorSpotIds) {
		this(region, sigungu, startDate, endDate, themes, companion, anchorSpotIds, List.of());
	}

	public AiCourseCommand {
		themes = themes == null ? List.of() : List.copyOf(themes);
		anchorSpotIds = anchorSpotIds == null ? List.of() : List.copyOf(anchorSpotIds);
		companion = companion == null ? CourseCompanion.COUPLE : companion;
		if (dayThemes == null || dayThemes.isEmpty()) {
			dayThemes = List.of();
		} else {
			long dayCount = startDate == null || endDate == null ? 0 : ChronoUnit.DAYS.between(startDate, endDate) + 1;
			var seen = new HashSet<Integer>();
			for (CourseDayTheme day : dayThemes) {
				if (day == null || day.dayNumber() < 1 || day.dayNumber() > dayCount || !seen.add(day.dayNumber())) {
					throw new CoreException(ErrorType.BAD_REQUEST, "날짜별 테마는 여행 기간 안의 날짜를 중복 없이 지정해야 합니다.");
				}
			}
			dayThemes = dayThemes.stream().sorted(Comparator.comparingInt(CourseDayTheme::dayNumber)).toList();
		}
	}
}
