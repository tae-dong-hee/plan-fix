package taedonghee.plan_fix.application.user;

import java.time.LocalDate;

/**
 * 사용자 Command DTO
 */
public final class UserCommand {

    private UserCommand() {
    }

    /**
     * 사용자 생성 입력값
     */
    public record Create(
            String username,
            String name,
            String email,
            String loginId,
            String password,
            LocalDate birthDate
    ) {
        public Create(String username, String name, String email, String loginId, String password) {
            this(username, name, email, loginId, password, null);
        }

        @Override public String toString() { return "UserCreate[redacted]"; }
    }

    /**
     * 사용자 프로필 수정 입력값
     */
    public record Update(
            String username,
            String name,
            String email
            , LocalDate birthDate
    ) {
        public Update(String username, String name, String email) {
            this(username, name, email, null);
        }
    }
}
