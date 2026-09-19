package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseRepository;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaEntity;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberJpaEntity;
import taedonghee.plan_fix.infrastructure.course.CourseMemberJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberRole;
import taedonghee.plan_fix.infrastructure.user.UserJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CourseInviteApplicationServiceTest {
    private static final Long COURSE_ID = 100L;
    private static final Long OWNER_ID = 1L;
    private static final Long MEMBER_ID = 2L;
    private static final String TOKEN = "existing-invite-token";
    private static final String INVITE_NOT_FOUND = "초대 링크를 찾을 수 없습니다.";
    private static final String PRIVATE_SHARING_MESSAGE = "나만 보기 코스는 초대할 수 없습니다. 먼저 전체 공개로 변경해 주세요.";

    private final CourseRepository courses = mock(CourseRepository.class);
    private final CourseInviteJpaRepository invites = mock(CourseInviteJpaRepository.class);
    private final CourseMemberJpaRepository members = mock(CourseMemberJpaRepository.class);
    private final UserJpaRepository users = mock(UserJpaRepository.class);
    private final CourseInviteApplicationService service = new CourseInviteApplicationService(courses, invites, members, users);

    @ParameterizedTest
    @EnumSource(value = CourseMemberRole.class, names = {"VIEWER", "EDITOR"})
    void private_course_owner_cannot_create_invites(CourseMemberRole role) {
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PRIVATE)));

        assertThatThrownBy(() -> service.createInvite(OWNER_ID, COURSE_ID, role, "https://example.com"))
                .isInstanceOfSatisfying(CoreException.class, error -> {
                    assertThat(error.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST);
                    assertThat(error.getMessage()).isEqualTo(PRIVATE_SHARING_MESSAGE);
                });

        verifyNoInteractions(invites, members);
    }

    @ParameterizedTest
    @EnumSource(value = CourseMemberRole.class, names = {"VIEWER", "EDITOR"})
    void public_course_owner_can_create_invites(CourseMemberRole role) {
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PUBLIC)));
        when(invites.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        CourseInviteApplicationService.CourseInviteResult result = service.createInvite(
                OWNER_ID, COURSE_ID, role, "https://example.com/");

        assertThat(result.memberRole()).isEqualTo(role);
        assertThat(result.token()).isNotBlank();
        assertThat(result.inviteUrl()).isEqualTo("https://example.com/course-invites/" + result.token());
        InOrder order = inOrder(courses, invites);
        order.verify(courses).findByIdForUpdate(COURSE_ID);
        order.verify(invites).existsByToken(result.token());
        order.verify(invites).save(any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void stale_private_invite_preview_never_discloses_course_details(boolean expired) {
        when(invites.findByToken(TOKEN)).thenReturn(Optional.of(invite(expired)));
        when(courses.findById(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PRIVATE)));

        assertHiddenInvite(() -> service.preview(TOKEN));
    }

    @Test
    void public_invite_preview_remains_available() {
        CourseInviteJpaEntity invite = invite(false);
        when(invites.findByToken(TOKEN)).thenReturn(Optional.of(invite));
        when(courses.findById(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PUBLIC)));

        CourseInviteApplicationService.CourseInvitePreview preview = service.preview(TOKEN);

        assertThat(preview.courseId()).isEqualTo(COURSE_ID);
        assertThat(preview.courseTitle()).isEqualTo("테스트 코스 제목");
        assertThat(preview.memberRole()).isEqualTo(CourseMemberRole.EDITOR);
        assertThat(preview.expiresAt()).isEqualTo(invite.getExpiresAt());
    }

    @ParameterizedTest
    @ValueSource(longs = {1L, 2L, 3L})
    void stale_private_invites_cannot_be_accepted_even_by_owner_or_previous_member(Long userId) {
        when(invites.findByToken(TOKEN)).thenReturn(Optional.of(invite(false)));
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PRIVATE)));

        assertHiddenInvite(() -> service.accept(userId, TOKEN));

        verifyNoInteractions(members);
    }

    @Test
    void revoked_invite_is_rechecked_after_waiting_for_course_lock() {
        when(invites.findByToken(TOKEN)).thenReturn(Optional.of(invite(false))).thenReturn(Optional.empty());
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PUBLIC)));

        assertHiddenInvite(() -> service.accept(MEMBER_ID, TOKEN));

        InOrder order = inOrder(courses, invites);
        order.verify(invites).findByToken(TOKEN);
        order.verify(courses).findByIdForUpdate(COURSE_ID);
        order.verify(invites).findByToken(TOKEN);
        verifyNoInteractions(members);
    }

    @Test
    void public_invite_accepts_new_member_with_invited_role() {
        when(invites.findByToken(TOKEN)).thenReturn(Optional.of(invite(false)));
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PUBLIC)));

        CourseInviteApplicationService.CourseInviteAcceptResult result = service.accept(MEMBER_ID, TOKEN);

        assertThat(result.courseId()).isEqualTo(COURSE_ID);
        assertThat(result.joined()).isTrue();
        assertThat(result.alreadyMember()).isFalse();
        ArgumentCaptor<CourseMemberJpaEntity> member = ArgumentCaptor.forClass(CourseMemberJpaEntity.class);
        verify(members).save(member.capture());
        assertThat(member.getValue().getUserId()).isEqualTo(MEMBER_ID);
        assertThat(member.getValue().getCourseId()).isEqualTo(COURSE_ID);
        assertThat(member.getValue().getRole()).isEqualTo(CourseMemberRole.EDITOR);
    }

    @Test
    void expired_public_invite_cannot_be_accepted() {
        when(invites.findByToken(TOKEN)).thenReturn(Optional.of(invite(true)));
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PUBLIC)));

        assertThatThrownBy(() -> service.accept(MEMBER_ID, TOKEN))
                .isInstanceOfSatisfying(CoreException.class, error -> {
                    assertThat(error.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST);
                    assertThat(error.getMessage()).isEqualTo("만료된 초대 링크입니다.");
                });
        verifyNoInteractions(members);
    }

    @Test
    void private_course_does_not_grant_stored_member_or_editor_access() {
        when(courses.findById(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PRIVATE)));

        assertThat(service.isMember(MEMBER_ID, COURSE_ID)).isFalse();
        assertThat(service.canEdit(MEMBER_ID, COURSE_ID)).isFalse();
        verifyNoInteractions(members);
    }

    @Test
    void deleted_course_does_not_grant_stored_member_or_editor_access() {
        when(courses.findById(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PUBLIC).delete()));

        assertThat(service.isMember(MEMBER_ID, COURSE_ID)).isFalse();
        assertThat(service.canEdit(MEMBER_ID, COURSE_ID)).isFalse();
        verifyNoInteractions(members);
    }

    @Test
    void anonymous_user_has_no_member_or_editor_access() {
        assertThat(service.isMember(null, COURSE_ID)).isFalse();
        assertThat(service.canEdit(null, COURSE_ID)).isFalse();
        verifyNoInteractions(courses, members);
    }

    @Test
    void public_course_keeps_stored_member_and_editor_access() {
        when(courses.findById(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PUBLIC)));
        when(members.existsByCourseIdAndUserId(COURSE_ID, MEMBER_ID)).thenReturn(true);
        when(members.existsByCourseIdAndUserIdAndRole(COURSE_ID, MEMBER_ID, CourseMemberRole.EDITOR)).thenReturn(true);

        assertThat(service.isMember(MEMBER_ID, COURSE_ID)).isTrue();
        assertThat(service.canEdit(MEMBER_ID, COURSE_ID)).isTrue();
    }

    @Test
    void private_course_owner_sees_only_owner_and_no_stale_invites() {
        when(courses.findById(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PRIVATE)));

        assertThat(service.members(OWNER_ID, COURSE_ID)).singleElement().satisfies(member -> {
            assertThat(member.userId()).isEqualTo(OWNER_ID);
            assertThat(member.role()).isEqualTo(CourseMemberRole.OWNER);
        });
        assertThat(service.pendingInvites(OWNER_ID, COURSE_ID)).isEmpty();
        verifyNoInteractions(members, invites);
    }

    @Test
    void private_course_member_role_cannot_be_changed() {
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PRIVATE)));

        assertThatThrownBy(() -> service.updateMemberRole(OWNER_ID, COURSE_ID, MEMBER_ID, CourseMemberRole.EDITOR))
                .isInstanceOfSatisfying(CoreException.class, error -> {
                    assertThat(error.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST);
                    assertThat(error.getMessage()).isEqualTo(PRIVATE_SHARING_MESSAGE);
                });
        verifyNoInteractions(members);
    }

    @Test
    void public_course_member_role_can_be_changed_after_locking_course() {
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PUBLIC)));
        CourseMemberJpaEntity member = CourseMemberJpaEntity.builder().courseId(COURSE_ID).userId(MEMBER_ID)
                .role(CourseMemberRole.VIEWER).createdAt(OffsetDateTime.now()).build();
        when(members.findByCourseIdOrderByCreatedAtAsc(COURSE_ID)).thenReturn(List.of(member));

        service.updateMemberRole(OWNER_ID, COURSE_ID, MEMBER_ID, CourseMemberRole.EDITOR);

        assertThat(member.getRole()).isEqualTo(CourseMemberRole.EDITOR);
        InOrder order = inOrder(courses, members);
        order.verify(courses).findByIdForUpdate(COURSE_ID);
        order.verify(members).findByCourseIdOrderByCreatedAtAsc(COURSE_ID);
    }

    @Test
    void owner_can_remove_stale_private_member_after_locking_course() {
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PRIVATE)));

        service.removeMember(OWNER_ID, COURSE_ID, MEMBER_ID);

        InOrder order = inOrder(courses, members);
        order.verify(courses).findByIdForUpdate(COURSE_ID);
        order.verify(members).deleteByCourseIdAndUserIdAndRoleIn(
                COURSE_ID, MEMBER_ID, List.of(CourseMemberRole.VIEWER, CourseMemberRole.EDITOR));
    }

    @Test
    void owner_can_cancel_stale_private_invite_after_locking_course() {
        when(courses.findByIdForUpdate(COURSE_ID)).thenReturn(Optional.of(course(CourseVisibility.PRIVATE)));
        CourseInviteJpaEntity invite = invite(false);
        when(invites.findByToken(TOKEN)).thenReturn(Optional.of(invite));

        service.cancelInvite(OWNER_ID, COURSE_ID, TOKEN);

        InOrder order = inOrder(courses, invites);
        order.verify(courses).findByIdForUpdate(COURSE_ID);
        order.verify(invites).findByToken(TOKEN);
        order.verify(invites).delete(invite);
    }

    private void assertHiddenInvite(org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(CoreException.class, error -> {
            assertThat(error.getErrorType()).isEqualTo(ErrorType.NOT_FOUND);
            assertThat(error.getMessage()).isEqualTo(INVITE_NOT_FOUND);
            assertThat(error.getMessage()).doesNotContain(COURSE_ID.toString(), "테스트 코스 제목");
        });
    }

    private CourseModel course(CourseVisibility visibility) {
        OffsetDateTime now = OffsetDateTime.now();
        return CourseModel.reconstruct(COURSE_ID, OWNER_ID, "테스트 코스 제목", null, null, visibility,
                CourseStatus.ACTIVE, 0, 0, null, null,
                List.of(new CourseDayModel(1, List.of(new CourseSpotModel(10L, "비공개 메모")))), now, now);
    }

    private CourseInviteJpaEntity invite(boolean expired) {
        OffsetDateTime now = OffsetDateTime.now();
        return CourseInviteJpaEntity.builder().courseId(COURSE_ID).createdByUserId(OWNER_ID).token(TOKEN)
                .memberRole(CourseMemberRole.EDITOR).createdAt(now.minusDays(1))
                .expiresAt(expired ? now.minusMinutes(1) : now.plusDays(1)).build();
    }
}
