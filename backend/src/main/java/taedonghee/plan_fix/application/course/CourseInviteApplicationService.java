package taedonghee.plan_fix.application.course;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseRepository;
import taedonghee.plan_fix.domain.course.CourseStatus;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.infrastructure.course.*;
import taedonghee.plan_fix.infrastructure.user.UserJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CourseInviteApplicationService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int INVITE_VALID_DAYS = 7;
    private final CourseRepository courseRepository;
    private final CourseInviteJpaRepository inviteRepository;
    private final CourseMemberJpaRepository memberRepository;
    private final UserJpaRepository userRepository;
    private final CourseMemberRevocationJpaRepository revocationRepository;

    @Transactional
    public CourseInviteResult createInvite(Long ownerId, Long courseId, CourseMemberRole memberRole, String frontendBaseUrl) {
        CourseModel course = activeCourseForUpdate(courseId);
        course.ensureOwner(ownerId);
        ensurePublicForSharing(course);
        if (memberRole == null || memberRole == CourseMemberRole.OWNER) {
            throw new CoreException(ErrorType.BAD_REQUEST, "초대 권한은 VIEWER 또는 EDITOR만 가능합니다.");
        }
        // Protect legacy memberships from links issued before this policy was introduced.
        // Baseline before saving the new invitation so that this new link can change roles.
        long previousInviteId = inviteRepository.latestInviteId(courseId);
        List<CourseMemberJpaEntity> members = memberRepository.findByCourseIdOrderByCreatedAtAsc(courseId);
        members.forEach(member -> member.initializeInviteBaseline(previousInviteId));
        OffsetDateTime now = OffsetDateTime.now();
        // Preparing/sharing the same invitation again must not add indistinguishable links.
        // Only reuse the newest issuance: EDITOR -> VIEWER -> EDITOR needs a new order.
        // A member's direct role change or removal may also require a fresh invitation.
        CourseInviteJpaEntity reusable = inviteRepository.findFirstByCourseIdOrderByCourseInviteIdDesc(courseId)
                .filter(invite -> invite.getMemberRole() == memberRole && invite.getExpiresAt().isAfter(now))
                .filter(invite -> members.stream().noneMatch(member ->
                        member.getLastAppliedInviteId() >= invite.getCourseInviteId() && member.getRole() != memberRole))
                .filter(invite -> !revocationRepository.existsByCourseIdAndRevokedThroughInviteIdGreaterThanEqual(
                        courseId, invite.getCourseInviteId()))
                .orElse(null);
        if (reusable != null) return inviteResult(reusable, frontendBaseUrl);
        String token = newToken();
        CourseInviteJpaEntity invite = inviteRepository.save(CourseInviteJpaEntity.builder()
                .courseId(courseId).createdByUserId(ownerId).token(token).memberRole(memberRole)
                .createdAt(now).expiresAt(now.plusDays(INVITE_VALID_DAYS)).build());
        return inviteResult(invite, frontendBaseUrl);
    }

    @Transactional
    public CourseInviteAcceptResult accept(Long userId, String token) {
        CourseInviteJpaEntity invite = inviteRepository.findByToken(token)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "초대 링크를 찾을 수 없습니다."));
        CourseModel course = courseRepository.findByIdForUpdate(invite.getCourseId())
                .filter(this::isPublicActiveCourse)
                .orElseThrow(this::inviteNotFound);
        // A visibility change may have revoked this link while we waited for the course lock.
        invite = inviteRepository.findByToken(token).orElseThrow(this::inviteNotFound);
        if (!invite.getExpiresAt().isAfter(OffsetDateTime.now())) {
            throw new CoreException(ErrorType.BAD_REQUEST, "만료된 초대 링크입니다.");
        }
        if (course.userId().equals(userId)) return new CourseInviteAcceptResult(course.courseId(), false, true);
        Long inviteId = invite.getCourseInviteId();
        CourseMemberJpaEntity member = memberRepository.findByCourseIdAndUserId(course.courseId(), userId).orElse(null);
        if (member != null && member.getLastAppliedInviteId() == null) {
            member.initializeInviteBaseline(inviteRepository.latestInviteId(course.courseId()));
        }
        // A duplicate/older link never rolls back a newer invite or an owner's role change.
        if (member != null && inviteId <= member.getLastAppliedInviteId()) {
            return new CourseInviteAcceptResult(course.courseId(), false, true);
        }
        if (revocationRepository.findByCourseIdAndUserId(course.courseId(), userId)
                .filter(revocation -> inviteId <= revocation.getRevokedThroughInviteId()).isPresent()) {
            throw new CoreException(ErrorType.FORBIDDEN, "이 초대로 다시 참여할 수 없습니다. 코스 작성자에게 새 초대를 요청해 주세요.");
        }
        if (member != null) {
            member.applyInviteRole(invite.getMemberRole(), inviteId);
            return new CourseInviteAcceptResult(course.courseId(), false, true);
        }
        member = CourseMemberJpaEntity.builder().courseId(course.courseId()).userId(userId)
                .role(invite.getMemberRole()).createdAt(OffsetDateTime.now()).build();
        member.applyInviteRole(invite.getMemberRole(), inviteId);
        memberRepository.save(member);
        return new CourseInviteAcceptResult(course.courseId(), true, false);
    }

    public List<CourseMemberResult> members(Long ownerId, Long courseId) {
        CourseModel course = activeCourse(courseId); course.ensureOwner(ownerId);
        List<CourseMemberResult> result = new java.util.ArrayList<>();
        result.add(userRepository.findById(course.userId()).map(u -> new CourseMemberResult(course.userId(), u.getName(), u.getUsername(), CourseMemberRole.OWNER, course.createdAt())).orElse(new CourseMemberResult(course.userId(), null, "소유자", CourseMemberRole.OWNER, course.createdAt())));
        if (course.visibility() != CourseVisibility.PUBLIC) return result;
        memberRepository.findByCourseIdOrderByCreatedAtAsc(courseId).stream().map(member -> userRepository.findById(member.getUserId()).map(u -> new CourseMemberResult(member.getUserId(), u.getName(), u.getUsername(), member.getRole(), member.getCreatedAt())).orElse(new CourseMemberResult(member.getUserId(), null, "사용자 #" + member.getUserId(), member.getRole(), member.getCreatedAt()))).forEach(result::add);
        return result;
    }
    public List<PendingInviteResult> pendingInvites(Long ownerId, Long courseId) {
        CourseModel course = activeCourse(courseId);
        course.ensureOwner(ownerId);
        if (course.visibility() != CourseVisibility.PUBLIC) return List.of();
        return inviteRepository.findByCourseIdOrderByCreatedAtDesc(courseId).stream()
                .filter(i -> i.getExpiresAt().isAfter(OffsetDateTime.now()))
                .map(i -> new PendingInviteResult(i.getToken(), i.getMemberRole(), i.getCreatedAt(), i.getExpiresAt())).toList();
    }

    /** One managed invitation per role, including links issued before deduplication. */
    public List<InviteGroupResult> inviteGroups(Long ownerId, Long courseId) {
        CourseModel course = activeCourse(courseId);
        course.ensureOwner(ownerId);
        if (course.visibility() != CourseVisibility.PUBLIC) return List.of();
        OffsetDateTime now = OffsetDateTime.now();
        var latestByRole = new EnumMap<CourseMemberRole, CourseInviteJpaEntity>(CourseMemberRole.class);
        for (CourseInviteJpaEntity invite : inviteRepository.findByCourseIdOrderByCreatedAtDesc(courseId)) {
            if (!invite.getExpiresAt().isAfter(now) || invite.getMemberRole() == CourseMemberRole.OWNER) continue;
            latestByRole.merge(invite.getMemberRole(), invite,
                    (existing, candidate) -> existing.getCourseInviteId() > candidate.getCourseInviteId() ? existing : candidate);
        }
        // Original tokens keep their own order, role and expiry when recipients accept them.
        // Sharing a group goes through createInvite so a role change can issue a fresh link.
        return List.of(CourseMemberRole.EDITOR, CourseMemberRole.VIEWER).stream()
                .filter(latestByRole::containsKey)
                .map(role -> {
                    CourseInviteJpaEntity invite = latestByRole.get(role);
                    return new InviteGroupResult(role, invite.getCreatedAt(), invite.getExpiresAt());
                }).toList();
    }

    @Transactional
    public void cancelInviteGroup(Long ownerId, Long courseId, CourseMemberRole role) {
        CourseModel course = activeCourseForUpdate(courseId);
        course.ensureOwner(ownerId);
        if (role == null || role == CourseMemberRole.OWNER) {
            throw new CoreException(ErrorType.BAD_REQUEST, "초대 권한은 VIEWER 또는 EDITOR만 가능합니다.");
        }
        // Delete every original link, including expired ones and their Kakao receipts.
        // Group cancellation must not leave an older hidden link available to join again.
        inviteRepository.deleteAll(inviteRepository.findByCourseIdOrderByCreatedAtDesc(courseId).stream()
                .filter(invite -> invite.getMemberRole() == role).toList());
    }


    @Transactional
    public void removeMember(Long ownerId, Long courseId, Long memberUserId) {
        CourseModel course = activeCourseForUpdate(courseId); course.ensureOwner(ownerId);
        long removed = memberRepository.deleteByCourseIdAndUserIdAndRoleIn(courseId, memberUserId, List.of(CourseMemberRole.VIEWER, CourseMemberRole.EDITOR));
        if (removed > 0) {
            long cutoff = inviteRepository.latestInviteId(courseId);
            CourseMemberRevocationJpaEntity revocation = revocationRepository.findByCourseIdAndUserId(courseId, memberUserId)
                    .orElseGet(() -> new CourseMemberRevocationJpaEntity(courseId, memberUserId, cutoff));
            revocation.revokeThrough(cutoff);
            revocationRepository.save(revocation);
        }
    }

    @Transactional public void updateMemberRole(Long ownerId, Long courseId, Long memberUserId, CourseMemberRole role) {
        CourseModel course = activeCourseForUpdate(courseId); course.ensureOwner(ownerId);
        ensurePublicForSharing(course);
        if (role == null || role == CourseMemberRole.OWNER) throw new CoreException(ErrorType.BAD_REQUEST, "멤버 권한은 VIEWER 또는 EDITOR만 가능합니다.");
        CourseMemberJpaEntity member = memberRepository.findByCourseIdAndUserId(courseId, memberUserId)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "멤버를 찾을 수 없습니다."));
        // Links already issued at the time of the owner's decision cannot undo it.
        member.applyInviteRole(role, Math.max(inviteRepository.latestInviteId(courseId),
                member.getLastAppliedInviteId() == null ? 0 : member.getLastAppliedInviteId()));
    }

    @Transactional public void cancelInvite(Long ownerId, Long courseId, String token) {
        CourseModel course = activeCourseForUpdate(courseId); course.ensureOwner(ownerId);
        CourseInviteJpaEntity invite = inviteRepository.findByToken(token).orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "초대 링크를 찾을 수 없습니다."));
        if (!invite.getCourseId().equals(courseId)) throw new CoreException(ErrorType.NOT_FOUND, "초대 링크를 찾을 수 없습니다.");
        inviteRepository.delete(invite);
    }

    public boolean isMember(Long userId, Long courseId) {
        return userId != null && courseRepository.findById(courseId).filter(this::isPublicActiveCourse).isPresent()
                && memberRepository.existsByCourseIdAndUserId(courseId, userId);
    }

    public boolean canEdit(Long userId, Long courseId) {
        return userId != null && courseRepository.findById(courseId).filter(this::isPublicActiveCourse).isPresent()
                && memberRepository.existsByCourseIdAndUserIdAndRole(courseId, userId, CourseMemberRole.EDITOR);
    }

    /** 로그인 전 초대 링크 화면에 보여줄 정보. 수락은 인증 후 POST로만 가능하다. */
    public CourseInvitePreview preview(String token) {
        CourseInviteJpaEntity invite = inviteRepository.findByToken(token)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "초대 링크를 찾을 수 없습니다."));
        CourseModel course = courseRepository.findById(invite.getCourseId())
                .filter(this::isPublicActiveCourse)
                .orElseThrow(this::inviteNotFound);
        if (!invite.getExpiresAt().isAfter(OffsetDateTime.now())) throw new CoreException(ErrorType.BAD_REQUEST, "만료된 초대 링크입니다.");
        return new CourseInvitePreview(course.courseId(), course.title(), invite.getMemberRole(), invite.getExpiresAt());
    }

    private CourseModel activeCourse(Long courseId) {
        return courseRepository.findById(courseId).filter(c -> c.status() == CourseStatus.ACTIVE)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "course not found. courseId=" + courseId));
    }

    private CourseModel activeCourseForUpdate(Long courseId) {
        return courseRepository.findByIdForUpdate(courseId).filter(c -> c.status() == CourseStatus.ACTIVE)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "course not found. courseId=" + courseId));
    }

    private boolean isPublicActiveCourse(CourseModel course) {
        return course.status() == CourseStatus.ACTIVE && course.visibility() == CourseVisibility.PUBLIC;
    }

    private void ensurePublicForSharing(CourseModel course) {
        if (course.visibility() != CourseVisibility.PUBLIC) {
            throw new CoreException(ErrorType.BAD_REQUEST, "나만 보기 코스는 초대할 수 없습니다. 먼저 전체 공개로 변경해 주세요.");
        }
    }

    private CoreException inviteNotFound() {
        return new CoreException(ErrorType.NOT_FOUND, "초대 링크를 찾을 수 없습니다.");
    }
    private String newToken() {
        byte[] bytes = new byte[32];
        do { RANDOM.nextBytes(bytes); String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); if (!inviteRepository.existsByToken(token)) return token; } while (true);
    }

    private CourseInviteResult inviteResult(CourseInviteJpaEntity invite, String frontendBaseUrl) {
        return CourseInviteResult.from(invite, frontendBaseUrl.replaceAll("/$", "") + "/course-invites/" + invite.getToken());
    }

    public record CourseInviteResult(String token, String inviteUrl, CourseMemberRole memberRole, OffsetDateTime expiresAt) {
        static CourseInviteResult from(CourseInviteJpaEntity invite, String url) { return new CourseInviteResult(invite.getToken(), url, invite.getMemberRole(), invite.getExpiresAt()); }
    }
    public record CourseInviteAcceptResult(Long courseId, boolean joined, boolean alreadyMember) { }
    public record CourseMemberResult(Long userId, String name, String username, CourseMemberRole role, OffsetDateTime joinedAt) { }
    public record PendingInviteResult(String token, CourseMemberRole role, OffsetDateTime createdAt, OffsetDateTime expiresAt) { }
    public record InviteGroupResult(CourseMemberRole role, OffsetDateTime createdAt, OffsetDateTime expiresAt) { }
    public record CourseInvitePreview(Long courseId, String courseTitle, CourseMemberRole memberRole, OffsetDateTime expiresAt) { }
}
