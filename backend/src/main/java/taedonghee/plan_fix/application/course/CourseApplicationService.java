package taedonghee.plan_fix.application.course;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.board.BoardRepository;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseRepository;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.course.CourseSortType;
import taedonghee.plan_fix.infrastructure.course.CourseMemberJpaRepository;
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
    private final CourseCoverImageSelector courseCoverImageSelector;

    @Autowired
    public CourseApplicationService(
            CourseRepository courseRepository,
            SpotRepository spotRepository,
            @Nullable BoardRepository boardRepository,
            @Nullable CourseMemberJpaRepository courseMemberJpaRepository,
            CourseCoverImageSelector courseCoverImageSelector
    ) {
        this.courseRepository = courseRepository;
        this.spotRepository = spotRepository;
        this.boardRepository = boardRepository;
        this.courseMemberJpaRepository = courseMemberJpaRepository;
        this.courseCoverImageSelector = courseCoverImageSelector;
    }

    public CourseApplicationService(
            CourseRepository courseRepository,
            SpotRepository spotRepository,
            @Nullable BoardRepository boardRepository,
            @Nullable CourseMemberJpaRepository courseMemberJpaRepository
    ) {
        this(courseRepository, spotRepository, boardRepository, courseMemberJpaRepository,
                new CourseCoverImageSelector(new ObjectMapper()));
    }

    public CourseApplicationService(CourseRepository courseRepository, SpotRepository spotRepository) {
        this(courseRepository, spotRepository, null, null);
    }

    /**
     * 코스 생성 처리
     */
    @Transactional
    public CourseResult create(Long userId, CourseCommand.Create command) {
        CourseModel course = CourseModel.create(userId, command.title(), command.description(), command.thumbnail(),
                command.visibility(), command.startDate(), command.endDate(), command.days());
        Set<Long> spotIds = collectSpotIds(course.days());
        Map<Long, SpotModel> spotsById = validateAndGetActiveSpots(spotIds);
        CourseModel saved = courseRepository.save(course);
        return CourseResult.from(saved, spotsById);
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
            courses.addAll(courseRepository.findActiveByIds(joinedCourseIds));
        }
        Set<Long> allSpotIds = courses.stream()
                .flatMap(c -> c.days().stream())
                .flatMap(d -> d.spots().stream())
                .map(CourseSpotModel::spotId)
                .collect(Collectors.toSet());

        Map<Long, SpotModel> spotsById = spotRepository.findAllByIdIn(allSpotIds).stream()
                .collect(Collectors.toMap(SpotModel::spotId, Function.identity()));

        return courses.stream()
                .map(course -> CourseResult.from(course, spotsById))
                .toList();
    }

    /**
     * 로그인 사용자가 좋아요 누른 코스 목록 조회 처리
     */
    public List<CourseResult> listLiked(Long userId) {
        List<CourseModel> courses = courseRepository.findLikedByUserId(userId);
        Set<Long> allSpotIds = courses.stream()
                .flatMap(c -> c.days().stream())
                .flatMap(d -> d.spots().stream())
                .map(CourseSpotModel::spotId)
                .collect(Collectors.toSet());

        Map<Long, SpotModel> spotsById = spotRepository.findAllByIdIn(allSpotIds).stream()
                .collect(Collectors.toMap(SpotModel::spotId, Function.identity()));

        return courses.stream()
                .map(course -> CourseResult.from(course, spotsById))
                .toList();
    }

    /** 공개 코스 전체/인기순 목록 조회 */
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
        return new CourseListResult(courses.stream()
                .map(course -> CourseListResult.Item.from(course, courseCoverImageSelector.select(course, spotsById)))
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
        throw new CoreException(ErrorType.BAD_REQUEST, "sort는 latest 또는 popular만 가능합니다. sort=" + sort);
    }

    /**
     * 코스 단건 조회 처리
     * - requesterId가 코스 작성자이거나,
     * - PUBLIC 공개 코스이거나,
     * - 활성 여행 이야기에 연결된 코스인 경우 조회 허용
     */
    public CourseResult getCourse(Long requesterId, Long courseId) {
        CourseModel course = getActiveCourseOrThrow(courseId);

        boolean isOwner = requesterId != null && requesterId.equals(course.userId());
        boolean isPublic = course.visibility() == CourseVisibility.PUBLIC;
        boolean isAttachedToActiveBoard = boardRepository != null && boardRepository.existsActiveByCourseId(courseId);

        boolean isMember = courseMemberJpaRepository != null && requesterId != null
                && courseMemberJpaRepository.existsByCourseIdAndUserId(courseId, requesterId);
        if (!isOwner && !isMember && !isPublic && !isAttachedToActiveBoard) {
            throw new CoreException(ErrorType.FORBIDDEN, "Only course owner can access private course.");
        }

        Set<Long> spotIds = collectSpotIds(course.days());
        Map<Long, SpotModel> spotsById = spotRepository.findAllByIdIn(spotIds).stream()
                .collect(Collectors.toMap(SpotModel::spotId, Function.identity()));

        return CourseResult.from(course, spotsById);
    }

    /**
     * 로그인 사용자의 코스 단건 조회 처리 (하위 호환용)
     */
    public CourseResult getMine(Long userId, Long courseId) {
        return getCourse(userId, courseId);
    }

    /**
     * 게시글(여행 이야기)에 연결된 코스를 자동으로 공개(PUBLIC) 상태로 전환
     */
    @Transactional
    public void ensureCoursePublicForBoard(Long userId, Long courseId) {
        if (courseId == null) {
            return;
        }
        CourseModel course = getActiveOwnedCourseOrThrow(userId, courseId);
        if (course.visibility() != CourseVisibility.PUBLIC) {
            CourseModel updated = course.update(
                    course.title(),
                    course.description(),
                    course.thumbnail(),
                    CourseVisibility.PUBLIC,
                    course.startDate(),
                    course.endDate(),
                    course.days()
            );
            courseRepository.save(updated);
        }
    }

    /**
     * 로그인 사용자의 코스 수정 처리
     */
    @Transactional
    public CourseResult update(Long userId, Long courseId, CourseCommand.Update command) {
        CourseModel course = getActiveCourseOrThrow(courseId);
        boolean isEditor = courseMemberJpaRepository != null
                && courseMemberJpaRepository.existsByCourseIdAndUserIdAndRole(courseId, userId, CourseMemberRole.EDITOR);
        if (!userId.equals(course.userId()) && !isEditor) {
            throw new CoreException(ErrorType.FORBIDDEN, "코스 소유자 또는 편집 권한이 있는 멤버만 수정할 수 있습니다.");
        }

        CourseModel updated = course.update(command.title(), command.description(), command.thumbnail(),
                command.visibility(), command.startDate(), command.endDate(), command.days());
        Set<Long> spotIds = collectSpotIds(updated.days());
        Map<Long, SpotModel> spotsById = validateAndGetActiveSpots(spotIds);

        CourseModel saved = courseRepository.save(updated);
        return CourseResult.from(saved, spotsById);
    }

    /**
     * 로그인 사용자의 코스 삭제 상태 변경 처리
     */
    @Transactional
    public CourseResult delete(Long userId, Long courseId) {
        CourseModel course = getActiveCourseOrThrow(courseId);
        course.ensureOwner(userId); // 작성자만 삭제 가능
        CourseModel deleted = courseRepository.save(course.delete());
        return CourseResult.from(deleted, Map.of());
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
