package taedonghee.plan_fix.infrastructure.course;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseDayTheme;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseRepository;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseSortType;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * CourseRepository JPA 구현체
 */
@Repository
@RequiredArgsConstructor
public class CourseRepositoryImpl implements CourseRepository {

    private final CourseJpaRepository courseJpaRepository;
    private final CourseSpotJpaRepository courseSpotJpaRepository;

    /**
     * 코스 저장 처리
     */
    @Override
    public CourseModel save(CourseModel course) {
        CourseJpaEntity saved = courseJpaRepository.save(toEntity(course));

        // 기존 Day별 spot 목록을 정리하고 새로 저장
        courseSpotJpaRepository.deleteByCourseId(saved.getCourseId());
        courseSpotJpaRepository.flush();

        List<CourseSpotJpaEntity> spotEntities = new ArrayList<>();
        OffsetDateTime now = OffsetDateTime.now();

        for (CourseDayModel day : course.days()) {
            for (int seq = 0; seq < day.spots().size(); seq++) {
                CourseSpotModel spot = day.spots().get(seq);
                spotEntities.add(CourseSpotJpaEntity.builder()
                        .courseId(saved.getCourseId())
                        .spotId(spot.spotId())
                        .dayNumber(day.dayNumber())
                        .sequence(seq)
                        .memo(spot.memo())
                        .createdAt(now)
                        .build());
            }
        }

        courseSpotJpaRepository.saveAll(spotEntities);
        return toDomain(saved);
    }

    /**
     * course_id 기반 코스 단건 조회 처리
     */
    @Override
    public Optional<CourseModel> findById(Long courseId) {
        return courseJpaRepository.findById(courseId).map(this::toDomain);
    }

    @Override
    public Optional<CourseModel> findByIdForUpdate(Long courseId) {
        return courseJpaRepository.findByIdForUpdate(courseId).map(this::toDomain);
    }

    /**
     * user_id 기반 활성 코스 목록 조회 처리
     */
    @Override
    public List<CourseModel> findActiveByUserId(Long userId) {
        return courseJpaRepository.findByUserIdAndStatusOrderByCourseIdDesc(userId, CourseStatus.ACTIVE)
                .stream()
                .map(this::toDomain)
                .toList();
    }

    @Override
    public List<CourseModel> findActiveByIds(java.util.Collection<Long> courseIds) {
        if (courseIds == null || courseIds.isEmpty()) return List.of();
        return courseJpaRepository.findByCourseIdInAndStatusOrderByCourseIdDesc(courseIds, CourseStatus.ACTIVE)
                .stream().map(this::toDomain).toList();
    }

    @Override
    public List<CourseModel> findLikedByUserId(Long userId) {
        return courseJpaRepository.findLikedCoursesByUserId(userId)
                .stream()
                .map(this::toDomain)
                .toList();
    }

    @Override
    public List<CourseModel> searchPublic(CourseSortType sort, int offset, int limit) {
        List<CourseJpaEntity> entities = switch (sort) {
            case LATEST -> courseJpaRepository.searchPublicByLatest(limit, offset);
            case POPULAR -> courseJpaRepository.searchPublicByPopular(limit, offset);
            case RANDOM -> courseJpaRepository.searchPublicByRandom(limit, offset);
        };
        return entities.stream().map(this::toDomain).toList();
    }

    @Override
    public long countPublic() {
        return courseJpaRepository.countPublic();
    }

    @Override
    public void incrementLikeCount(Long courseId) {
        courseJpaRepository.incrementLikeCount(courseId);
    }

    @Override
    public void decrementLikeCount(Long courseId) {
        courseJpaRepository.decrementLikeCount(courseId);
    }

    /**
     * 도메인 모델을 JPA 엔티티로 변환
     */
    private CourseJpaEntity toEntity(CourseModel course) {
        return CourseJpaEntity.builder()
                .courseId(course.courseId())
                .userId(course.userId())
                .title(course.title())
                .description(course.description())
                .thumbnail(course.thumbnail())
                .visibility(course.visibility())
                .generatedBy(course.generatedBy())
                .themes(course.themes())
                .dayThemes(course.days().stream().map(CourseDayModel::dayTheme).toList())
                .status(course.status())
                .viewCount(course.viewCount())
                .likeCount(course.likeCount())
                .startDate(course.startDate())
                .endDate(course.endDate())
                .createdAt(course.createdAt().truncatedTo(ChronoUnit.MICROS))
                .updatedAt(course.updatedAt().truncatedTo(ChronoUnit.MICROS))
                .build();
    }

    /**
     * JPA 엔티티와 course_spots 목록을 Day 구조 도메인 모델로 변환
     */
    private CourseModel toDomain(CourseJpaEntity entity) {
        List<CourseSpotJpaEntity> spotEntities = courseSpotJpaRepository
                .findByCourseIdOrderByDayNumberAscSequenceAsc(entity.getCourseId());

        Map<Integer, List<CourseSpotModel>> spotsByDay = new LinkedHashMap<>();
        for (CourseSpotJpaEntity spotEntity : spotEntities) {
            spotsByDay.computeIfAbsent(spotEntity.getDayNumber(), k -> new ArrayList<>())
                    .add(new CourseSpotModel(spotEntity.getSpotId(), spotEntity.getMemo()));
        }

        Map<Integer, CourseDayTheme> themesByDay = new LinkedHashMap<>();
        if (entity.getDayThemes() != null) {
            entity.getDayThemes().forEach(day -> themesByDay.put(day.dayNumber(), day));
        }

        int totalDays;
        if (entity.getStartDate() != null && entity.getEndDate() != null) {
            totalDays = (int) ChronoUnit.DAYS.between(entity.getStartDate(), entity.getEndDate()) + 1;
        } else {
            totalDays = Math.max(spotsByDay.keySet().stream().max(Integer::compareTo).orElse(1),
                    themesByDay.keySet().stream().max(Integer::compareTo).orElse(1));
        }

        List<CourseDayModel> days = new ArrayList<>(totalDays);
        for (int d = 1; d <= totalDays; d++) {
            List<CourseSpotModel> spots = spotsByDay.getOrDefault(d, List.of());
            CourseDayTheme metadata = themesByDay.getOrDefault(d, new CourseDayTheme(d, null, null));
            days.add(new CourseDayModel(d, spots, metadata.themes(), metadata.tripIdeas()));
        }

        return CourseModel.reconstruct(entity.getCourseId(), entity.getUserId(), entity.getTitle(),
                entity.getDescription(), entity.getThumbnail(), entity.getVisibility(), entity.getStatus(),
                entity.getViewCount(), entity.getLikeCount(), entity.getStartDate(), entity.getEndDate(),
                days, entity.getCreatedAt(), entity.getUpdatedAt(), entity.getGeneratedBy(), entity.getThemes());
    }
}
