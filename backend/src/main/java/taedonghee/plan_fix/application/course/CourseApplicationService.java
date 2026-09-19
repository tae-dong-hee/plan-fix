package taedonghee.plan_fix.application.course;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.application.spot.SpotThumbnailResolver;
import taedonghee.plan_fix.domain.board.BoardRepository;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseRepository;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.course.CourseSortType;
import taedonghee.plan_fix.infrastructure.course.CourseMemberJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseLikeJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberRole;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.Collection;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 코스 Application Service
 */
@Service
@Transactional(readOnly = true)
public class CourseApplicationService {

    private static final int MAX_LIST_SIZE = 100;

    private final CourseRepository courseRepository;
    private final SpotRepository spotRepository;
    private final BoardRepository boardRepository;
    private final CourseMemberJpaRepository courseMemberJpaRepository;
    private final CourseInviteJpaRepository courseInviteJpaRepository;
    private final CourseLikeJpaRepository courseLikeJpaRepository;
    private final CourseCoverImageSelector courseCoverImageSelector;
    private final SpotThumbnailResolver spotThumbnailResolver;

    @Autowired
    public CourseApplicationService(
            CourseRepository courseRepository,
            SpotRepository spotRepository,
            @Nullable BoardRepository boardRepository,
            @Nullable CourseMemberJpaRepository courseMemberJpaRepository,
            CourseCoverImageSelector courseCoverImageSelector,
            SpotThumbnailResolver spotThumbnailResolver,
            CourseInviteJpaRepository courseInviteJpaRepository,
            CourseLikeJpaRepository courseLikeJpaRepository
    ) {
        this.courseRepository = courseRepository;
        this.spotRepository = spotRepository;
        this.boardRepository = boardRepository;
        this.courseMemberJpaRepository = courseMemberJpaRepository;
        this.courseInviteJpaRepository = courseInviteJpaRepository;
        this.courseLikeJpaRepository = courseLikeJpaRepository;
        this.courseCoverImageSelector = courseCoverImageSelector;
        this.spotThumbnailResolver = spotThumbnailResolver;
    }

    public CourseApplicationService(CourseRepository courseRepository, SpotRepository spotRepository,
                                    @Nullable BoardRepository boardRepository,
                                    @Nullable CourseMemberJpaRepository courseMemberJpaRepository,
                                    CourseCoverImageSelector courseCoverImageSelector,
                                    SpotThumbnailResolver spotThumbnailResolver) {
        this(courseRepository, spotRepository, boardRepository, courseMemberJpaRepository,
                courseCoverImageSelector, spotThumbnailResolver, null, null);
    }

    public CourseApplicationService(
            CourseRepository courseRepository,
            SpotRepository spotRepository,
            @Nullable BoardRepository boardRepository,
            @Nullable CourseMemberJpaRepository courseMemberJpaRepository,
            SpotThumbnailResolver spotThumbnailResolver
    ) {
        this(courseRepository, spotRepository, boardRepository, courseMemberJpaRepository,
                new CourseCoverImageSelector(new ObjectMapper()), spotThumbnailResolver);
    }

    public CourseApplicationService(CourseRepository courseRepository, SpotRepository spotRepository,
                                    SpotThumbnailResolver spotThumbnailResolver) {
        this(courseRepository, spotRepository, null, null, spotThumbnailResolver);
    }

    /**
     * 코스 생성 처리
     */
    @Transactional
    public CourseResult create(Long userId, CourseCommand.Create command) {
        CourseModel course = CourseModel.create(userId, command.title(), command.description(), command.thumbnail(),
                command.visibility(), command.startDate(), command.endDate(), command.days(),
                command.generatedBy(), command.themes());
        Set<Long> spotIds = collectSpotIds(course.days());
        Map<Long, SpotModel> spotsById = validateAndGetActiveSpots(spotIds);
        CourseModel saved = courseRepository.save(course);
        return CourseResult.from(saved, spotsById, spotThumbnailResolver.resolve(spotsById.values()));
    }

    /**
     * 로그인 사용자의 코스 목록 조회 처리 (N+1 방지를 위해 전체 spot 일괄 조회)
     */
    public List<CourseResult> listMine(Long userId) {
        List<CourseModel> courses = new ArrayList<>(courseRepository.findActiveByUserId(userId));
        if (courseMemberJpaRepository != null) {
            Set<Long> joinedCourseIds = courseMemberJpaRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                    .map(member -> member.getCourseId()).collect(Collectors.toSet());
            Set<Long> ownedCourseIds = courses.stream().map(CourseModel::courseId).collect(Collectors.toSet());
            joinedCourseIds.removeAll(ownedCourseIds);
            // 예전 비공개 코스의 멤버십이 남아 있어도 작성자 외에는 목록에 노출하지 않는다.
            courses.addAll(courseRepository.findActiveByIds(joinedCourseIds).stream()
                    .filter(course -> course.visibility() == CourseVisibility.PUBLIC).toList());
        }
        Set<Long> allSpotIds = courses.stream()
                .flatMap(c -> c.days().stream())
                .flatMap(d -> d.spots().stream())
                .map(CourseSpotModel::spotId)
                .collect(Collectors.toSet());

        Map<Long, SpotModel> spotsById = spotRepository.findAllByIdIn(allSpotIds).stream()
                .collect(Collectors.toMap(SpotModel::spotId, Function.identity()));
        Map<Long, String> thumbnails = spotThumbnailResolver.resolve(spotsById.values());

        return courses.stream()
                .map(course -> CourseResult.from(course, spotsById, thumbnails))
                .toList();
    }

    /**
     * 로그인 사용자가 좋아요 누른 코스 목록 조회 처리
     */
    public List<CourseResult> listLiked(Long userId) {
        List<CourseModel> courses = courseRepository.findLikedByUserId(userId).stream()
                .filter(course -> course.visibility() == CourseVisibility.PUBLIC || userId.equals(course.userId()))
                .toList();
        Set<Long> allSpotIds = courses.stream()
                .flatMap(c -> c.days().stream())
                .flatMap(d -> d.spots().stream())
                .map(CourseSpotModel::spotId)
                .collect(Collectors.toSet());

        Map<Long, SpotModel> spotsById = spotRepository.findAllByIdIn(allSpotIds).stream()
                .collect(Collectors.toMap(SpotModel::spotId, Function.identity()));
        Map<Long, String> thumbnails = spotThumbnailResolver.resolve(spotsById.values());

        return courses.stream()
                .map(course -> CourseResult.from(course, spotsById, thumbnails))
                .toList();
    }

    /** 공개 코스 최신순/인기순/무작위 목록 조회 */
    public CourseListResult listPublic(CourseListQuery query) {
        validateListQuery(query);
        CourseSortType sort = parseSort(query.sort());
        List<CourseModel> courses = courseRepository.searchPublic(sort, query.offset(), query.size());
        Set<Long> spotIds = courses.stream()
                .filter(course -> course.thumbnail() == null || course.thumbnail().isBlank())
                .flatMap(course -> course.days().stream())
                .flatMap(day -> day.spots().stream())
                .map(CourseSpotModel::spotId)
                .collect(Collectors.toSet());
        Map<Long, SpotModel> spotsById = spotIds.isEmpty() ? Map.of()
                : spotRepository.findAllByIdIn(spotIds).stream()
                .collect(Collectors.toMap(SpotModel::spotId, Function.identity()));
        Map<Long, String> covers = courseCoverImageSelector.selectForCourses(courses, spotsById);
        return new CourseListResult(courses.stream()
                .map(course -> CourseListResult.Item.from(course, covers.get(course.courseId())))
                .toList(),
                query.offset(), query.size(), courseRepository.countPublic());
    }

    private void validateListQuery(CourseListQuery query) {
        if (query.offset() < 0) {
            throw new CoreException(ErrorType.BAD_REQUEST, "offset은 0 이상이어야 합니다.");
        }
        if (query.size() < 1 || query.size() > MAX_LIST_SIZE) {
            throw new CoreException(ErrorType.BAD_REQUEST, "size는 1~" + MAX_LIST_SIZE + " 사이여야 합니다.");
        }
    }

    private CourseSortType parseSort(String sort) {
        if (sort == null || sort.isBlank() || "latest".equals(sort)) {
            return CourseSortType.LATEST;
        }
        if ("popular".equals(sort)) {
            return CourseSortType.POPULAR;
        }
        if ("random".equals(sort)) {
            return CourseSortType.RANDOM;
        }
        throw new CoreException(ErrorType.BAD_REQUEST, "sort는 latest, popular 또는 random만 가능합니다. sort=" + sort);
    }

    /**
     * 코스 단건 조회 처리
     * - requesterId가 코스 작성자이거나,
     * - PUBLIC 공개 코스인 경우 조회 허용. PRIVATE는 기존 멤버도 접근할 수 없다.
     */
    public CourseResult getCourse(Long requesterId, Long courseId) {
        CourseModel course = getActiveCourseOrThrow(courseId);

        boolean isOwner = requesterId != null && requesterId.equals(course.userId());
        boolean isPublic = course.visibility() == CourseVisibility.PUBLIC;
        if (!isOwner && !isPublic) {
            throw new CoreException(ErrorType.FORBIDDEN, "나만 보기 코스는 작성자만 확인할 수 있습니다.");
        }

        Set<Long> spotIds = collectSpotIds(course.days());
        Map<Long, SpotModel> spotsById = spotRepository.findAllByIdIn(spotIds).stream()
                .collect(Collectors.toMap(SpotModel::spotId, Function.identity()));

        return CourseResult.from(course, spotsById, spotThumbnailResolver.resolve(spotsById.values()));
    }

    /**
     * 로그인 사용자의 코스 단건 조회 처리 (하위 호환용)
     */
    public CourseResult getMine(Long userId, Long courseId) {
        return getCourse(userId, courseId);
    }

    /**
     * 여행 이야기에는 작성자가 직접 공개한 코스만 연결할 수 있다.
     * 코스 잠금은 게시글 저장까지 유지되어 비공개 전환과 연결이 엇갈리지 않는다.
     */
    @Transactional
    public void validatePublicCourseForBoard(Long userId, Long courseId) {
        if (courseId == null) {
            return;
        }
        CourseModel course = getActiveCourseForUpdateOrThrow(courseId);
        course.ensureOwner(userId);
        if (course.visibility() != CourseVisibility.PUBLIC) {
            throw new CoreException(ErrorType.BAD_REQUEST,
                    "나만 보기 코스는 여행 이야기에 연결할 수 없습니다. 코스를 전체 공개로 변경한 뒤 다시 연결해 주세요.");
        }
    }

    /**
     * 로그인 사용자의 코스 수정 처리
     */
    @Transactional
    public CourseResult update(Long userId, Long courseId, CourseCommand.Update command) {
        CourseModel course = getActiveCourseForUpdateOrThrow(courseId);
        boolean isOwner = userId.equals(course.userId());
        boolean isEditor = course.visibility() == CourseVisibility.PUBLIC && courseMemberJpaRepository != null
                && courseMemberJpaRepository.existsByCourseIdAndUserIdAndRole(courseId, userId, CourseMemberRole.EDITOR);
        if (!isOwner && !isEditor) {
            throw new CoreException(ErrorType.FORBIDDEN, "코스 소유자 또는 편집 권한이 있는 멤버만 수정할 수 있습니다.");
        }

        CourseVisibility visibility = command.visibility() == null ? course.visibility() : command.visibility();
        if (!isOwner && visibility != course.visibility()) {
            throw new CoreException(ErrorType.FORBIDDEN, "공개 범위는 코스 작성자만 변경할 수 있습니다.");
        }

        CourseModel updated = course.update(command.title(), command.description(), command.thumbnail(),
                visibility, command.startDate(), command.endDate(), command.days(),
                command.generatedBy(), command.themes());
        Set<Long> spotIds = collectSpotIds(updated.days());
        Map<Long, SpotModel> spotsById = validateAndGetActiveSpots(spotIds);

        CourseModel saved = courseRepository.save(updated);
        // 기존 PRIVATE 데이터에 남아 있는 공유 권한도 다시 공개할 때 되살리지 않는다.
        if (visibility == CourseVisibility.PRIVATE || course.visibility() == CourseVisibility.PRIVATE) {
            if (courseMemberJpaRepository != null) courseMemberJpaRepository.deleteByCourseId(courseId);
            if (courseInviteJpaRepository != null) courseInviteJpaRepository.deleteByCourseId(courseId);
            if (boardRepository != null) boardRepository.unlinkCourse(courseId);
            if (courseLikeJpaRepository != null) {
                courseLikeJpaRepository.deleteOtherUsersLikes(courseId, course.userId());
                courseLikeJpaRepository.synchronizeCourseLikeCount(courseId);
                saved = getActiveCourseOrThrow(courseId);
            }
        }
        return CourseResult.from(saved, spotsById, spotThumbnailResolver.resolve(spotsById.values()));
    }

    /**
     * 로그인 사용자의 코스 삭제 상태 변경 처리
     */
    @Transactional
    public CourseResult delete(Long userId, Long courseId) {
        CourseModel course = getActiveCourseForUpdateOrThrow(courseId);
        course.ensureOwner(userId); // 작성자만 삭제 가능
        CourseModel deleted = courseRepository.save(course.delete());
        return CourseResult.from(deleted, Map.of(), Map.of());
    }

    /**
     * 게시글 작성 등 다른 기능에서 사용하는 코스 소유권 검증용 조회
     */
    public CourseModel getActiveOwnedCourseOrThrow(Long userId, Long courseId) {
        CourseModel course = getActiveCourseOrThrow(courseId);
        course.ensureOwner(userId);
        return course;
    }

    /**
     * 활성 코스 조회 실패 예외 처리
     */
    private CourseModel getActiveCourseOrThrow(Long courseId) {
        return courseRepository.findById(courseId)
                .filter(course -> course.status() == CourseStatus.ACTIVE)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "course not found. courseId=" + courseId));
    }

    private CourseModel getActiveCourseForUpdateOrThrow(Long courseId) {
        return courseRepository.findByIdForUpdate(courseId)
                .filter(course -> course.status() == CourseStatus.ACTIVE)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "course not found. courseId=" + courseId));
    }

    /**
     * Day 목록에서 포함된 모든 spotId 추출
     */
    private Set<Long> collectSpotIds(List<CourseDayModel> days) {
        Set<Long> spotIds = new HashSet<>();
        for (CourseDayModel day : days) {
            for (CourseSpotModel spot : day.spots()) {
                spotIds.add(spot.spotId());
            }
        }
        return spotIds;
    }

    /**
     * spot 존재 여부 및 ACTIVE 상태를 한 번의 조회로 검증 후 맵으로 반환
     */
    private Map<Long, SpotModel> validateAndGetActiveSpots(Collection<Long> spotIds) {
        if (spotIds.isEmpty()) {
            return Map.of();
        }
        List<SpotModel> spots = spotRepository.findAllByIdIn(spotIds);
        Map<Long, SpotModel> spotsById = spots.stream()
                .collect(Collectors.toMap(SpotModel::spotId, Function.identity()));

        for (Long spotId : spotIds) {
            SpotModel spot = spotsById.get(spotId);
            if (spot == null || spot.status() != SpotStatus.ACTIVE) {
                throw new CoreException(ErrorType.NOT_FOUND, "spot not found. spotId=" + spotId);
            }
        }
        return spotsById;
    }
}
