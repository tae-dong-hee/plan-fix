package taedonghee.plan_fix.interfaces.api.course;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import taedonghee.plan_fix.infrastructure.course.CourseDayAccommodationJpaEntity;
import taedonghee.plan_fix.infrastructure.course.CourseDayAccommodationJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberRole;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;

@RestController
@RequestMapping("/api/v1/courses/{courseId}/day-accommodations")
@RequiredArgsConstructor
public class CourseDayAccommodationController {

    private final CourseJpaRepository courses;
    private final CourseDayAccommodationJpaRepository accommodations;
    private final CourseMemberJpaRepository members;

    @GetMapping
    public ResponseEntity<List<Response>> get(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long courseId
    ) {
        requireAccess(user, courseId, false);
        List<Response> response = accommodations.findByCourseIdOrderByDayNumber(courseId).stream()
                .map(Response::from)
                .toList();
        return ResponseEntity.ok(response);
    }

    @PutMapping
    @Transactional
    public ResponseEntity<List<Response>> put(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long courseId,
            @RequestBody List<Request> values
    ) {
        requireAccess(user, courseId, true);
        if (!isValid(values)) {
            return ResponseEntity.badRequest().build();
        }

        accommodations.deleteByCourseId(courseId);
        // Release the (course_id, day_number) unique keys before inserting replacements.
        accommodations.flush();
        OffsetDateTime updatedAt = OffsetDateTime.now();
        List<CourseDayAccommodationJpaEntity> entities = values.stream()
                .map(value -> toEntity(courseId, value, updatedAt))
                .toList();
        List<Response> response = accommodations.saveAll(entities).stream()
                .map(Response::from)
                .toList();
        return ResponseEntity.ok(response);
    }

    private boolean isValid(List<Request> values) {
        if (values == null) {
            return false;
        }
        HashSet<Integer> dayNumbers = new HashSet<>();
        return values.stream().allMatch(value -> value != null
                && value.dayNumber() > 0
                && value.name() != null
                && !value.name().isBlank()
                && dayNumbers.add(value.dayNumber()));
    }

    private CourseDayAccommodationJpaEntity toEntity(
            Long courseId,
            Request value,
            OffsetDateTime updatedAt
    ) {
        return CourseDayAccommodationJpaEntity.builder()
                .courseId(courseId)
                .dayNumber(value.dayNumber())
                .name(value.name().strip())
                .address(value.address())
                .latitude(value.latitude())
                .longitude(value.longitude())
                .memo(value.memo())
                .updatedAt(updatedAt)
                .build();
    }

    private void requireAccess(AuthenticatedUser user, Long courseId, boolean write) {
        // Serialize edits with role changes, removals and visibility changes on the course row.
        var course = (write ? courses.findByIdForUpdate(courseId) : courses.findById(courseId))
                .filter(value -> value.getStatus() == CourseStatus.ACTIVE)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "코스를 찾을 수 없습니다."));
        if (user != null && user.id().equals(course.getUserId())) return;
        if (user != null && course.getVisibility() == CourseVisibility.PUBLIC) {
            boolean allowed = write
                    ? members.existsByCourseIdAndUserIdAndRole(courseId, user.id(), CourseMemberRole.EDITOR)
                    : members.existsByCourseIdAndUserId(courseId, user.id());
            if (allowed) return;
        }
        throw new CoreException(ErrorType.FORBIDDEN, write
                ? "숙소 정보는 코스 작성자 또는 편집 권한이 있는 멤버만 수정할 수 있습니다."
                : "숙소 정보는 코스 작성자와 초대된 멤버만 확인할 수 있습니다.");
    }

    public record Request(
            int dayNumber,
            String name,
            String address,
            BigDecimal latitude,
            BigDecimal longitude,
            String memo
    ) { }

    public record Response(
            int dayNumber,
            String name,
            String address,
            BigDecimal latitude,
            BigDecimal longitude,
            String memo
    ) {
        private static Response from(CourseDayAccommodationJpaEntity entity) {
            return new Response(
                    entity.getDayNumber(),
                    entity.getName(),
                    entity.getAddress(),
                    entity.getLatitude(),
                    entity.getLongitude(),
                    entity.getMemo()
            );
        }
    }
}
