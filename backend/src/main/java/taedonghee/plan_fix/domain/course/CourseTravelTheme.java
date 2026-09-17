package taedonghee.plan_fix.domain.course;

import com.fasterxml.jackson.annotation.JsonCreator;

/** 코스에 저장하는 사용자 선택 테마. AI의 후보 점수 정책과 독립적인 값이다. */
public enum CourseTravelTheme {
    HEALING,
    FOOD,
    CAFE,
    ACTIVITY,
    CULTURE;

    @JsonCreator
    public static CourseTravelTheme fromValue(String value) {
        return value == null ? null : valueOf(value);
    }
}
