package taedonghee.plan_fix.interfaces.api.course;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import taedonghee.plan_fix.infrastructure.course.CourseDayAccommodationJpaEntity;
import taedonghee.plan_fix.infrastructure.course.CourseDayAccommodationJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseJpaRepository;
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

    @GetMapping
    public ResponseEntity<List<Response>> get(
            @AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable Long courseId
    ) {
        requireOwner(user, courseId);
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
        requireOwner(user, courseId);
        if (!isValid(values)) {
            return ResponseEntity.badRequest().build();
        }

        accommodations.deleteByCourseId(courseId);
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

    private void requireOwner(AuthenticatedUser user, Long courseId) {
        boolean isOwner = user != null && courses.findById(courseId)
                .filter(course -> user.id().equals(course.getUserId()))
                .isPresent();
        if (!isOwner) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
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
