package taedonghee.plan_fix.infrastructure.course;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CourseDayAccommodationJpaRepository
        extends JpaRepository<CourseDayAccommodationJpaEntity, Long> {

    List<CourseDayAccommodationJpaEntity> findByCourseIdOrderByDayNumber(Long courseId);

    void deleteByCourseId(Long courseId);
}
