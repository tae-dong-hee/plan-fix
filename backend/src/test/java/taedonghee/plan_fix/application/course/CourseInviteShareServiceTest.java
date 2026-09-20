package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaEntity;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class CourseInviteShareServiceTest {
    private final CourseInviteJpaRepository invites = mock(CourseInviteJpaRepository.class);

    @Test
    void missingAdminKeyNeverAcceptsAnUnverifiedCallback() {
        var service = new CourseInviteShareService(invites, " ");
        assertThatThrownBy(() -> service.delivered("KakaoAK ", "token", UUID.randomUUID()))
                .isInstanceOfSatisfying(CoreException.class, e -> assertThat(e.getErrorType()).isEqualTo(ErrorType.SERVICE_UNAVAILABLE));
        verifyNoInteractions(invites);
    }

    @Test
    void expiredInviteDoesNotRecordDelivery() {
        var invite = CourseInviteJpaEntity.builder().expiresAt(OffsetDateTime.now().minusMinutes(1)).build();
        when(invites.findByTokenForUpdate("token")).thenReturn(Optional.of(invite));
        new CourseInviteShareService(invites, "key").delivered("KakaoAK key", "token", UUID.randomUUID());
        assertThat(invite.getKakaoShareRequestIds()).isEmpty();
    }
}
