package taedonghee.plan_fix.interfaces.api.user;

import taedonghee.plan_fix.application.user.UserResult;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.domain.user.UserStatus;

import java.time.OffsetDateTime;
import java.time.LocalDate;

/**
 * 사용자 API 응답 DTO
 */
public record UserResponse(
        Long userId,
        String username,
        String name,
        String email,
        LocalDate birthDate,
        String profileImageUrl,
        String defaultAvatarColor,
        UserRole role,
        UserStatus status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {

    /**
     * application 결과값 변환
     */
    public static UserResponse from(UserResult result) {
        return new UserResponse(
                result.userId(),
                result.username(),
                result.name(),
                result.email(),
                result.birthDate(),
                result.profileImageUrl(),
                result.defaultAvatarColor(),
                result.role(),
                result.status(),
                result.createdAt(),
                result.updatedAt()
        );
    }
}
