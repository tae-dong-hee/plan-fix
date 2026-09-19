package taedonghee.plan_fix.infrastructure.course;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import taedonghee.plan_fix.domain.course.CourseDayTheme;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

/** 날짜별 메타데이터를 JSON으로 보존하며 기존 코스의 null은 빈 목록으로 읽는다. */
@Converter
public class CourseDayThemesConverter implements AttributeConverter<List<CourseDayTheme>, String> {
    private static final JsonMapper MAPPER = JsonMapper.builder().build();
    private static final TypeReference<List<CourseDayTheme>> TYPE = new TypeReference<>() {};

    @Override
    public String convertToDatabaseColumn(List<CourseDayTheme> days) {
        return days == null || days.isEmpty() ? null : MAPPER.writeValueAsString(days);
    }

    @Override
    public List<CourseDayTheme> convertToEntityAttribute(String stored) {
        return stored == null || stored.isBlank() ? List.of() : List.copyOf(MAPPER.readValue(stored, TYPE));
    }
}
