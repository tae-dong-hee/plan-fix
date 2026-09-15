package taedonghee.plan_fix.infrastructure.course;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/** 날짜별 숙소. 같은 숙소를 여러 날에 넣거나 일자별로 바꿀 수 있다. */
@Entity
@Table(
        name = "course_day_accommodations",
        uniqueConstraints = @UniqueConstraint(columnNames = {"course_id", "day_number"})
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CourseDayAccommodationJpaEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "course_id", nullable = false)
    private Long courseId;

    @Column(name = "day_number", nullable = false)
    private int dayNumber;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 300)
    private String address;

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    @Column(length = 500)
    private String memo;

    @Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
    private OffsetDateTime updatedAt;

    @Builder
    private CourseDayAccommodationJpaEntity(
            Long courseId,
            int dayNumber,
            String name,
            String address,
            BigDecimal latitude,
            BigDecimal longitude,
            String memo,
            OffsetDateTime updatedAt
    ) {
        this.courseId = courseId;
        this.dayNumber = dayNumber;
        this.name = name;
        this.address = address;
        this.latitude = latitude;
        this.longitude = longitude;
        this.memo = memo;
        this.updatedAt = updatedAt;
    }
}
