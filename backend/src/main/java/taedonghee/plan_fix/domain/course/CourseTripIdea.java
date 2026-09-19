package taedonghee.plan_fix.domain.course;

import com.fasterxml.jackson.annotation.JsonCreator;

import java.util.List;

/** 화면에서 선택한 여행 제안. 기본 취향이 같아도 제안의 의미를 별도로 보존한다. */
public enum CourseTripIdea {
    COAST_CAFE("바다와 카페", List.of(CourseTravelTheme.HEALING, CourseTravelTheme.CAFE)),
    FOOD_WALK("맛집과 산책", List.of(CourseTravelTheme.HEALING, CourseTravelTheme.FOOD)),
    NATURE("자연 속 쉼", List.of(CourseTravelTheme.HEALING)),
    ACTIVITY("신나는 액티비티", List.of(CourseTravelTheme.ACTIVITY)),
    CULTURE_LOCAL("문화와 골목 여행", List.of(CourseTravelTheme.CULTURE, CourseTravelTheme.FOOD)),
    CAFE("여유로운 카페 투어", List.of(CourseTravelTheme.CAFE));

    private final String label;
    private final List<CourseTravelTheme> themes;

    CourseTripIdea(String label, List<CourseTravelTheme> themes) {
        this.label = label;
        this.themes = themes;
    }

    public String label() { return label; }
    public List<CourseTravelTheme> themes() { return themes; }

    @JsonCreator
    public static CourseTripIdea fromValue(String value) {
        return value == null ? null : valueOf(value);
    }
}
