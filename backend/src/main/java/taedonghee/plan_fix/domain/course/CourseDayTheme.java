package taedonghee.plan_fix.domain.course;

import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

/** 장소 유무와 관계없이 보존하는 일차별 여행 의도. */
public record CourseDayTheme(int dayNumber, List<CourseTravelTheme> themes, List<CourseTripIdea> tripIdeas) {
    public CourseDayTheme {
        if (dayNumber < 1 || dayNumber > 30) {
            throw new CoreException(ErrorType.BAD_REQUEST, "dayNumber must be between 1 and 30.");
        }
        themes = normalized(themes, "themes");
        tripIdeas = normalized(tripIdeas, "tripIdeas");
        var combined = new LinkedHashSet<>(themes);
        tripIdeas.forEach(idea -> combined.addAll(idea.themes()));
        themes = List.copyOf(combined);
    }

    private static <T> List<T> normalized(List<T> values, String name) {
        if (values == null) return List.of();
        if (values.stream().anyMatch(Objects::isNull) || values.stream().distinct().count() != values.size()) {
            throw new CoreException(ErrorType.BAD_REQUEST, name + " must contain distinct supported values.");
        }
        return List.copyOf(values);
    }
}
