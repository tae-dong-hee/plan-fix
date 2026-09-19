package taedonghee.plan_fix.interfaces.api.course;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import taedonghee.plan_fix.application.course.CourseApplicationService;
import taedonghee.plan_fix.application.course.CourseCommand;
import taedonghee.plan_fix.application.course.CourseResult;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CourseControllerTest {

    private final CourseApplicationService courseApplicationService = mock(CourseApplicationService.class);
    private final CourseController controller = new CourseController(courseApplicationService);
    private final AuthenticatedUser principal = new AuthenticatedUser(10L, "tester", UserRole.USER);

    @Test
    void create_uses_principal_id_and_returns_created_response() {
        LocalDate start = LocalDate.of(2026, 9, 12);
        LocalDate end = LocalDate.of(2026, 9, 12);

        CourseRequest.Create request = new CourseRequest.Create(
                "Course", "desc", "thumb.jpg", CourseVisibility.PUBLIC,
                start, end,
                List.of(new CourseRequest.Day(1, List.of(new CourseRequest.Spot(1L, "memo"))))
        );
        CourseCommand.Create command = new CourseCommand.Create(
                "Course", "desc", "thumb.jpg", CourseVisibility.PUBLIC,
                start, end,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(1L, "memo"))))
        );
        when(courseApplicationService.create(10L, command)).thenReturn(result());

        ResponseEntity<CourseResponse> response = controller.create(principal, request);

        assertThat(response.getStatusCode().value()).isEqualTo(201);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().courseId()).isEqualTo(1L);
        verify(courseApplicationService).create(10L, command);
    }

    @Test
    void list_mine_uses_principal_id() {
        CourseResult own = result();
        CourseResult shared = new CourseResult(2L, 20L, "초대받은 코스", own.description(), own.thumbnail(),
                own.visibility(), own.status(), 0, 0, own.startDate(), own.endDate(), own.days(),
                own.createdAt(), own.updatedAt());
        when(courseApplicationService.listMine(10L)).thenReturn(List.of(own, shared));

        ResponseEntity<List<CourseResponse>> response = controller.listMine(principal);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).hasSize(2);
        assertThat(response.getBody()).extracting(CourseResponse::isOwner).containsExactly(true, false);
        verify(courseApplicationService).listMine(10L);
    }

    @Test
    void update_uses_principal_id_and_course_id() {
        LocalDate start = LocalDate.of(2026, 9, 12);
        LocalDate end = LocalDate.of(2026, 9, 12);

        CourseRequest.Update request = new CourseRequest.Update(
                "Updated", null, null, CourseVisibility.PRIVATE,
                start, end,
                List.of(new CourseRequest.Day(1, List.of(new CourseRequest.Spot(1L, null))))
        );
        CourseCommand.Update command = new CourseCommand.Update(
                "Updated", null, null, CourseVisibility.PRIVATE,
                start, end,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(1L, null))))
        );
        when(courseApplicationService.update(10L, 1L, command, null)).thenReturn(result());

        ResponseEntity<CourseResponse> response = controller.update(principal, 1L, request);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        verify(courseApplicationService).update(10L, 1L, command, null);
    }

    @Test
    void delete_uses_principal_id_and_course_id() {
        when(courseApplicationService.delete(10L, 1L)).thenReturn(result());

        ResponseEntity<CourseResponse> response = controller.delete(principal, 1L);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        verify(courseApplicationService).delete(10L, 1L);
    }

    private CourseResult result() {
        OffsetDateTime now = OffsetDateTime.now();
        LocalDate start = LocalDate.of(2026, 9, 12);
        LocalDate end = LocalDate.of(2026, 9, 12);
        return new CourseResult(1L, 10L, "Course", "desc", "thumb.jpg", CourseVisibility.PUBLIC,
                CourseStatus.ACTIVE, 0, 0, start, end,
                List.of(new CourseResult.Day(1, List.of(
                        new CourseResult.Spot(1L, 0, "memo", "스팟", "관광지", "51", "150", "주소", "thumb.jpg", null, null)
                ))), now, now);
    }
}
