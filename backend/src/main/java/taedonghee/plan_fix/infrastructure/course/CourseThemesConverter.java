package taedonghee.plan_fix.infrastructure.course;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;

import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

/** 고정된 테마 코드를 순서대로 저장한다. 이전 레코드의 null은 빈 목록으로 읽는다. */
@Converter
public class CourseThemesConverter implements AttributeConverter<List<CourseTravelTheme>, String> {
    @Override
    public String convertToDatabaseColumn(List<CourseTravelTheme> themes) {
        return themes == null || themes.isEmpty() ? null
                : themes.stream().map(Enum::name).collect(Collectors.joining(","));
    }

    @Override
    public List<CourseTravelTheme> convertToEntityAttribute(String stored) {
        return stored == null || stored.isBlank() ? List.of()
                : Arrays.stream(stored.split(",", -1)).map(CourseTravelTheme::valueOf).toList();
    }
}
