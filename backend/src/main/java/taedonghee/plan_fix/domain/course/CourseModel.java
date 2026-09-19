package taedonghee.plan_fix.domain.course;

import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;

/**
 * 코스 Model
 */
public class CourseModel {

    private static final int TITLE_MAX_LENGTH = 100;
    private static final int DESCRIPTION_MAX_LENGTH = 1000;
    private static final int THUMBNAIL_MAX_LENGTH = 500;
    private static final int DAYS_MAX_SIZE = 30;

    private final Long courseId;
    private final Long userId;
    private final String title;
    private final String description;
    private final String thumbnail;
    private final CourseVisibility visibility;
    private final CourseGenerationSource generatedBy;
    private final List<CourseTravelTheme> themes;
    private final CourseStatus status;
    private final long viewCount;
    private final long likeCount;
    private final LocalDate startDate;
    private final LocalDate endDate;
    private final List<CourseDayModel> days;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime updatedAt;

    /**
     * 코스 생성 및 복원 시 공통으로 사용하는 생성자
     */
    private CourseModel(Long courseId, Long userId, String title, String description, String thumbnail,
                        CourseVisibility visibility, CourseStatus status, long viewCount, long likeCount,
                        LocalDate startDate, LocalDate endDate, List<CourseDayModel> days,
                        OffsetDateTime createdAt, OffsetDateTime updatedAt,
                        CourseGenerationSource generatedBy, List<CourseTravelTheme> themes) {
        validate(userId, title, description, thumbnail, viewCount, likeCount, startDate, endDate, days);
        this.courseId = courseId;
        this.userId = userId;
        this.title = normalizeRequired(title);
        this.description = normalizeOptional(description);
        this.thumbnail = normalizeOptional(thumbnail);
        this.visibility = visibility == null ? CourseVisibility.PRIVATE : visibility;
        this.generatedBy = generatedBy;
        this.themes = normalizeThemes(themes);
        this.status = status == null ? CourseStatus.ACTIVE : status;
        this.viewCount = viewCount;
        this.likeCount = likeCount;
        this.startDate = startDate;
        this.endDate = endDate;
        this.days = days.stream().map(day -> {
            CourseDayTheme metadata = day.dayTheme();
            return new CourseDayModel(day.dayNumber(), day.spots(), metadata.themes(), metadata.tripIdeas());
        }).toList();
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    /**
     * 신규 코스 생성
     */
    public static CourseModel create(Long userId, String title, String description, String thumbnail,
                                     CourseVisibility visibility, LocalDate startDate, LocalDate endDate,
                                     List<CourseDayModel> days) {
        return create(userId, title, description, thumbnail, visibility, startDate, endDate, days, null, null);
    }

    public static CourseModel create(Long userId, String title, String description, String thumbnail,
                                     CourseVisibility visibility, LocalDate startDate, LocalDate endDate,
                                     List<CourseDayModel> days, CourseGenerationSource generatedBy,
                                     List<CourseTravelTheme> themes) {
        OffsetDateTime now = OffsetDateTime.now();
        return new CourseModel(null, userId, title, description, thumbnail, visibility, CourseStatus.ACTIVE,
                0L, 0L, startDate, endDate, days, now, now, generatedBy, themes);
    }

    /**
     * 저장된 코스 정보를 기반으로 CourseModel 복원
     */
    public static CourseModel reconstruct(Long courseId, Long userId, String title, String description,
                                          String thumbnail, CourseVisibility visibility, CourseStatus status,
                                          long viewCount, long likeCount, LocalDate startDate, LocalDate endDate,
                                          List<CourseDayModel> days, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        return reconstruct(courseId, userId, title, description, thumbnail, visibility, status,
                viewCount, likeCount, startDate, endDate, days, createdAt, updatedAt, null, null);
    }

    public static CourseModel reconstruct(Long courseId, Long userId, String title, String description,
                                          String thumbnail, CourseVisibility visibility, CourseStatus status,
                                          long viewCount, long likeCount, LocalDate startDate, LocalDate endDate,
                                          List<CourseDayModel> days, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                                          CourseGenerationSource generatedBy, List<CourseTravelTheme> themes) {
        return new CourseModel(courseId, userId, title, description, thumbnail, visibility, status,
                viewCount, likeCount, startDate, endDate, days, createdAt, updatedAt, generatedBy, themes);
    }

    /**
     * 코스 기본 정보 및 포함된 Day 목록 수정
     */
    public CourseModel update(String title, String description, String thumbnail, CourseVisibility visibility,
                              LocalDate startDate, LocalDate endDate, List<CourseDayModel> days) {
        return update(title, description, thumbnail, visibility, startDate, endDate, days, null, null);
    }

    /** 생략한 생성 정보는 유지하며, 빈 테마 목록은 기존 선택을 해제한다. */
    public CourseModel update(String title, String description, String thumbnail, CourseVisibility visibility,
                              LocalDate startDate, LocalDate endDate, List<CourseDayModel> days,
                              CourseGenerationSource generatedBy, List<CourseTravelTheme> themes) {
        ensureActive();
        return new CourseModel(courseId, userId, title, description, thumbnail, visibility, status,
                viewCount, likeCount, startDate, endDate, preserveOmittedDayThemes(days), createdAt, OffsetDateTime.now(),
                generatedBy == null ? this.generatedBy : generatedBy, themes == null ? this.themes : themes);
    }

    private List<CourseDayModel> preserveOmittedDayThemes(List<CourseDayModel> updatedDays) {
        if (updatedDays == null) return null;
        return updatedDays.stream().map(day -> {
            if (day == null || day.themes() != null || day.tripIdeas() != null) return day;
            CourseDayModel previous = days.stream()
                    .filter(existing -> existing.dayNumber() == day.dayNumber()).findFirst().orElse(null);
            return previous == null ? day : new CourseDayModel(day.dayNumber(), day.spots(),
                    previous.themes(), previous.tripIdeas());
        }).toList();
    }

    /**
     * 코스 삭제 상태 변경
     */
    public CourseModel delete() {
        if (status == CourseStatus.DELETED) {
            return this;
        }
        return new CourseModel(courseId, userId, title, description, thumbnail, visibility, CourseStatus.DELETED,
                viewCount, likeCount, startDate, endDate, days, createdAt, OffsetDateTime.now(), generatedBy, themes);
    }

    /**
     * 요청 사용자가 코스 작성자인지 검증
     */
    public void ensureOwner(Long requestedUserId) {
        if (!userId.equals(requestedUserId)) {
            throw new CoreException(ErrorType.FORBIDDEN, "course access denied. courseId=" + courseId);
        }
    }

    /**
     * 삭제된 코스 수정 방지
     */
    private void ensureActive() {
        if (status == CourseStatus.DELETED) {
            throw new CoreException(ErrorType.CONFLICT, "deleted course. courseId=" + courseId);
        }
    }

    /**
     * 코스 필수값, 길이, 카운트, Day 목록 및 기간 검증
     */
    private void validate(Long userId, String title, String description, String thumbnail,
                          long viewCount, long likeCount, LocalDate startDate, LocalDate endDate,
                          List<CourseDayModel> days) {
        if (userId == null) {
            throw new CoreException(ErrorType.BAD_REQUEST, "userId is required.");
        }
        if (title == null || title.isBlank()) {
            throw new CoreException(ErrorType.BAD_REQUEST, "title is required.");
        }
        if (title.strip().length() > TITLE_MAX_LENGTH) {
            throw new CoreException(ErrorType.BAD_REQUEST, "title must be 100 characters or less.");
        }
        if (description != null && description.strip().length() > DESCRIPTION_MAX_LENGTH) {
            throw new CoreException(ErrorType.BAD_REQUEST, "description must be 1000 characters or less.");
        }
        if (thumbnail != null && thumbnail.strip().length() > THUMBNAIL_MAX_LENGTH) {
            throw new CoreException(ErrorType.BAD_REQUEST, "thumbnail must be 500 characters or less.");
        }
        if (viewCount < 0 || likeCount < 0) {
            throw new CoreException(ErrorType.BAD_REQUEST, "counts must not be negative.");
        }
        if (days == null || days.isEmpty()) {
            throw new CoreException(ErrorType.BAD_REQUEST, "course must contain at least one day.");
        }
        if (days.size() > DAYS_MAX_SIZE) {
            throw new CoreException(ErrorType.BAD_REQUEST, "days size must not exceed " + DAYS_MAX_SIZE + ".");
        }
        if (days.stream().anyMatch(Objects::isNull)) {
            throw new CoreException(ErrorType.BAD_REQUEST, "days must not contain null.");
        }

        // dayNumber 연속성 검증 (1부터 1씩 증가)
        for (int i = 0; i < days.size(); i++) {
            if (days.get(i).dayNumber() != i + 1) {
                throw new CoreException(ErrorType.BAD_REQUEST,
                        "dayNumber must be sequential starting from 1. expected=" + (i + 1) + ", actual=" + days.get(i).dayNumber());
            }
        }

        // 전체 Day에 포함된 spot 개수의 합이 최소 1개 이상이어야 함
        int totalSpots = days.stream().mapToInt(day -> day.spots().size()).sum();
        if (totalSpots == 0) {
            throw new CoreException(ErrorType.BAD_REQUEST, "course must contain at least one spot.");
        }

        // 날짜 검증
        if ((startDate == null && endDate != null) || (startDate != null && endDate == null)) {
            throw new CoreException(ErrorType.BAD_REQUEST, "startDate and endDate must both be present or both be null.");
        }
        if (startDate != null && endDate != null) {
            if (endDate.isBefore(startDate)) {
                throw new CoreException(ErrorType.BAD_REQUEST, "endDate must not be before startDate.");
            }
            long durationDays = ChronoUnit.DAYS.between(startDate, endDate) + 1;
            if (durationDays != days.size()) {
                throw new CoreException(ErrorType.BAD_REQUEST,
                        "days size (" + days.size() + ") must match date duration (" + durationDays + ").");
            }
        }
    }

    private static List<CourseTravelTheme> normalizeThemes(List<CourseTravelTheme> themes) {
        if (themes == null) {
            return List.of();
        }
        if (themes.size() > CourseTravelTheme.values().length || themes.stream().anyMatch(Objects::isNull)
                || themes.stream().distinct().count() != themes.size()) {
            throw new CoreException(ErrorType.BAD_REQUEST, "themes must contain distinct supported themes.");
        }
        return List.copyOf(themes);
    }

    private String normalizeRequired(String value) {
        return value.strip();
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.strip();
        return normalized.isEmpty() ? null : normalized;
    }

    public Long courseId() { return courseId; }
    public Long userId() { return userId; }
    public String title() { return title; }
    public String description() { return description; }
    public String thumbnail() { return thumbnail; }
    public CourseGenerationSource generatedBy() { return generatedBy; }
    public List<CourseTravelTheme> themes() { return themes; }
    public CourseVisibility visibility() { return visibility; }
    public CourseStatus status() { return status; }
    public long viewCount() { return viewCount; }
    public long likeCount() { return likeCount; }
    public LocalDate startDate() { return startDate; }
    public LocalDate endDate() { return endDate; }
    public List<CourseDayModel> days() { return days; }
    public OffsetDateTime createdAt() { return createdAt; }
    public OffsetDateTime updatedAt() { return updatedAt; }
}
