package taedonghee.plan_fix.domain.course;

import com.fasterxml.jackson.annotation.JsonCreator;

/** 코스 초안을 만든 방식. 기록이 없는 이전 코스는 null로 구분한다. */
public enum CourseGenerationSource {
    LLM,
    RULE_BASED,
    MANUAL;

    @JsonCreator
    public static CourseGenerationSource fromValue(String value) {
        return value == null ? null : valueOf(value);
    }
}
