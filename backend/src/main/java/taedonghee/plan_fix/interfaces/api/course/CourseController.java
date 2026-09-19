package taedonghee.plan_fix.interfaces.api.course;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import taedonghee.plan_fix.application.course.CourseApplicationService;
import taedonghee.plan_fix.application.course.CourseListQuery;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;

import java.util.List;

/**
 * 코스 API HTTP Controller
 */
@RestController
@RequestMapping("/api/v1/courses")
@RequiredArgsConstructor
public class CourseController {

    private final CourseApplicationService courseApplicationService;

    /**
     * 코스 생성 API
     */
    @PostMapping
    public ResponseEntity<CourseResponse> create(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @RequestBody CourseRequest.Create request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(CourseResponse.from(courseApplicationService.create(principal.id(), request.toCommand())));
    }

    /**
     * 로그인 사용자의 코스 목록 조회 API
     */
    @GetMapping
    public ResponseEntity<List<CourseResponse>> listMine(@AuthenticationPrincipal AuthenticatedUser principal) {
        List<CourseResponse> responses = courseApplicationService.listMine(principal.id()).stream()
                .map(course -> CourseResponse.from(course, principal.id()))
                .toList();
        return ResponseEntity.ok(responses);
    }

    /** 공개 코스 최신순/인기순/무작위 목록 조회 API. 예: GET /api/v1/courses/public?sort=random */
    @GetMapping("/public")
    public ResponseEntity<CourseListResponse> listPublic(
            @org.springframework.web.bind.annotation.RequestParam(required = false) String sort,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "0") int offset,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "20") int size
    ) {
        return ResponseEntity.ok(CourseListResponse.from(
                courseApplicationService.listPublic(new CourseListQuery(sort, offset, size))));
    }

    /**
     * 코스 단건 조회 API (공개 코스 또는 소유자·수락된 멤버만 조회 가능)
     */
    @GetMapping("/{courseId}")
    public ResponseEntity<CourseResponse> get(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable Long courseId
    ) {
        Long requesterId = principal != null ? principal.id() : null;
        return ResponseEntity.ok(CourseResponse.from(
                courseApplicationService.getCourse(requesterId, courseId),
                requesterId
        ));
    }

    /**
     * 로그인 사용자의 코스 수정 API
     */
    @PatchMapping("/{courseId}")
    public ResponseEntity<CourseResponse> update(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable Long courseId,
            @RequestBody CourseRequest.Update request
    ) {
        return ResponseEntity.ok(CourseResponse.from(
                courseApplicationService.update(principal.id(), courseId, request.toCommand())));
    }

    /**
     * 로그인 사용자의 코스 삭제 API
     */
    @DeleteMapping("/{courseId}")
    public ResponseEntity<CourseResponse> delete(
            @AuthenticationPrincipal AuthenticatedUser principal,
            @PathVariable Long courseId
    ) {
        return ResponseEntity.ok(CourseResponse.from(courseApplicationService.delete(principal.id(), courseId)));
    }
}
