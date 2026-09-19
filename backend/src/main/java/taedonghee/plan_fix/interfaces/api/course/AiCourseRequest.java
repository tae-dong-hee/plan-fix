package taedonghee.plan_fix.interfaces.api.course;

import taedonghee.plan_fix.application.course.ai.AiCourseCommand;
import taedonghee.plan_fix.application.course.ai.CourseCompanion;
import taedonghee.plan_fix.application.course.ai.CourseTheme;
import taedonghee.plan_fix.domain.course.CourseDayTheme;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.LocalDate;
import java.util.List;

/**
 * [interfaces] AI 코스 초안 생성 요청 DTO.
 */
public record AiCourseRequest(
	String region,
	String sigungu,
	LocalDate startDate,
	LocalDate endDate,
	List<String> themes,
	String companion,
	List<Long> anchorSpotIds,
	List<CourseDayTheme> dayThemes
) {
	public AiCourseRequest(String region, String sigungu, LocalDate startDate, LocalDate endDate,
		List<String> themes, String companion, List<Long> anchorSpotIds) {
		this(region, sigungu, startDate, endDate, themes, companion, anchorSpotIds, List.of());
	}

	public AiCourseCommand toCommand() {
		return new AiCourseCommand(
			region,
			sigungu,
			startDate,
			endDate,
			parseThemes(themes),
			parseCompanion(companion),
			anchorSpotIds,
			dayThemes
		);
	}

	private static List<CourseTheme> parseThemes(List<String> values) {
		if (values == null) {
			return List.of();
		}
		return values.stream().map(AiCourseRequest::parseTheme).toList();
	}

	private static CourseTheme parseTheme(String value) {
		try {
			return CourseTheme.valueOf(value.toUpperCase(java.util.Locale.ROOT));
		} catch (IllegalArgumentException | NullPointerException e) {
			throw new CoreException(ErrorType.BAD_REQUEST, "알 수 없는 테마입니다. theme=" + value);
		}
	}

	private static CourseCompanion parseCompanion(String value) {
		if (value == null || value.isBlank()) {
			return CourseCompanion.COUPLE;
		}
		try {
			return CourseCompanion.valueOf(value.toUpperCase());
		} catch (IllegalArgumentException e) {
			throw new CoreException(ErrorType.BAD_REQUEST, "알 수 없는 동행 유형입니다. companion=" + value);
		}
	}
}
