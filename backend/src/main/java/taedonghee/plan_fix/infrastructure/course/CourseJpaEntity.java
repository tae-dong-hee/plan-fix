package taedonghee.plan_fix.infrastructure.course;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;

import taedonghee.plan_fix.domain.course.CourseGenerationSource;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;

import java.util.List;
import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * courses 테이블 JPA 매핑 엔티티
 */
@Entity
@Table(
        name = "courses",
        indexes = {
                @Index(name = "idx_courses_user_status", columnList = "user_id, status")
        }
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseJpaEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "course_id")
    private Long courseId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "description", length = 1000)
    private String description;

    @Column(name = "thumbnail", length = 500)
    private String thumbnail;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private CourseVisibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "generated_by", length = 20)
    private CourseGenerationSource generatedBy;

    @Convert(converter = CourseThemesConverter.class)
    @Column(name = "themes", length = 100)
    private List<CourseTravelTheme> themes;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private CourseStatus status;

    @Column(name = "view_count", nullable = false)
    private long viewCount;

    @Column(name = "like_count", nullable = false)
    private long likeCount;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
    private OffsetDateTime updatedAt;

    @Builder
    private CourseJpaEntity(Long courseId, Long userId, String title, String description, String thumbnail,
                            CourseVisibility visibility, CourseStatus status, long viewCount, long likeCount,
                            LocalDate startDate, LocalDate endDate,
                            OffsetDateTime createdAt, OffsetDateTime updatedAt,
                            CourseGenerationSource generatedBy, List<CourseTravelTheme> themes) {
        this.courseId = courseId;
        this.userId = userId;
        this.title = title;
        this.description = description;
        this.thumbnail = thumbnail;
        this.visibility = visibility;
        this.generatedBy = generatedBy;
        this.themes = themes == null ? List.of() : List.copyOf(themes);
        this.status = status;
        this.viewCount = viewCount;
        this.likeCount = likeCount;
        this.startDate = startDate;
        this.endDate = endDate;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}
