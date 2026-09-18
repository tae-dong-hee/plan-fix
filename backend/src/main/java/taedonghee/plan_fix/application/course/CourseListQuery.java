package taedonghee.plan_fix.application.course;

/** 공개 코스 목록 조회 요청. sort는 latest, popular 또는 random이며 기본값은 latest다. */
public record CourseListQuery(String sort, int offset, int size) {
}
