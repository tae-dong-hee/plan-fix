package taedonghee.plan_fix.application.course;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class CourseInviteShareService {
    private final CourseInviteJpaRepository invites;
    private final String adminKey;

    public CourseInviteShareService(CourseInviteJpaRepository invites,
            @Value("${app.kakao-share.admin-key:}") String adminKey) {
        this.invites = invites;
        this.adminKey = adminKey.trim();
    }

    public ShareStatus status(Long userId, String token, UUID requestId) {
        var invite = invites.findByToken(token)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "초대 링크를 찾을 수 없습니다."));
        if (!invite.getCreatedByUserId().equals(userId)) {
            throw new CoreException(ErrorType.FORBIDDEN);
        }
        return new ShareStatus(invite.getKakaoShareRequestIds().contains(requestId));
    }

    /** Only an authenticated Kakao delivery webhook can mark an attempt as sent. */
    @Transactional
    public void delivered(String authorization, String token, UUID requestId) {
        if (adminKey.isEmpty()) throw new CoreException(ErrorType.SERVICE_UNAVAILABLE);
        if (authorization == null || !MessageDigest.isEqual(
                ("KakaoAK " + adminKey).getBytes(StandardCharsets.UTF_8),
                authorization.getBytes(StandardCharsets.UTF_8))) {
            throw new CoreException(ErrorType.UNAUTHORIZED);
        }
        // Kakao can retry a webhook or report more than one selected chatroom.
        // Lock + set makes delivery idempotent, including concurrent callbacks.
        // A delayed callback for a revoked/expired invitation needs no further work.
        invites.findByTokenForUpdate(token)
                .filter(invite -> invite.getExpiresAt().isAfter(OffsetDateTime.now()))
                .ifPresent(invite -> invite.recordKakaoShare(requestId));
    }

    public record ShareStatus(boolean shared) { }
}
