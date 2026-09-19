package taedonghee.plan_fix.domain.user;

import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.OffsetDateTime;
import java.time.LocalDate;
import java.util.regex.Pattern;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 사용자 Model
 */
public class UserModel {

    private static final int USERNAME_MIN_LENGTH = 2;
    private static final int USERNAME_MAX_LENGTH = 30;
    private static final int NAME_MIN_LENGTH = 2;
    private static final int NAME_MAX_LENGTH = 30;
    private static final int EMAIL_MAX_LENGTH = 255;

    // 실명 형식 검증: 한글만 허용
    private static final Pattern NAME_PATTERN = Pattern.compile("^[가-힣]+$");

    // 닉네임에 제어문자(개행·탭 포함) 사용 여부 확인
    private static final Pattern CONTROL_CHAR_PATTERN = Pattern.compile(".*\\p{Cntrl}.*", Pattern.DOTALL);

    // 이메일 형식 검증: 아이디@도메인.확장자 형식, 확장자는 영문 2자 이상
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final Long userId;
    private final String username;
    private final String name;
    private final String email;
    private final LocalDate birthDate;
    private final String profileImageKey;
    private final String defaultAvatarColor;
    private static final List<String> AVATAR_COLORS = List.of("violet", "blue", "green", "amber", "rose");
    private final UserRole role;
    private final UserStatus status;
    private final OffsetDateTime createdAt;
    private final OffsetDateTime updatedAt;

    private UserModel(
            Long userId,
            String username,
            String name,
            String email,
            LocalDate birthDate,
            String profileImageKey,
            String defaultAvatarColor,
            UserRole role,
            UserStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        validateUsername(username);
        validateName(name);
        validateEmail(email);

        this.userId = userId;
        this.username = username;
        this.name = name;
        this.email = email;
        this.birthDate = birthDate;
        this.profileImageKey = profileImageKey;
        // Migration backfills existing users; this stable fallback also covers legacy rows.
        this.defaultAvatarColor = defaultAvatarColor != null && AVATAR_COLORS.contains(defaultAvatarColor) ? defaultAvatarColor
                : AVATAR_COLORS.get(userId == null ? 0 : Math.floorMod(userId, AVATAR_COLORS.size()));
        this.role = role == null ? UserRole.USER : role;
        this.status = status == null ? UserStatus.ACTIVE : status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    /**
     * 신규 사용자 생성
     */
    public static UserModel create(String username, String name, String email, LocalDate birthDate) {
        OffsetDateTime now = OffsetDateTime.now();
        return new UserModel(null, username, name, email, birthDate, null,
                AVATAR_COLORS.get(ThreadLocalRandom.current().nextInt(AVATAR_COLORS.size())),
                UserRole.USER, UserStatus.ACTIVE, now, now);
    }

    /** 기존 호출부 호환용 생년월일 없는 생성 */
    public static UserModel create(String username, String name, String email) {
        return create(username, name, email, null);
    }

    /**
     * 저장된 사용자 정보를 기반으로 UserModel 복원
     * DB에 이미 저장되어 있던 User 데이터를 다시 UserModel 객체로 복원할 때 사용
     */
    public static UserModel reconstruct(
            Long userId,
            String username,
            String name,
            String email,
            LocalDate birthDate,
            UserRole role,
            UserStatus status,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt
    ) {
        return reconstruct(userId, username, name, email, birthDate, null, null, role, status, createdAt, updatedAt);
    }

    public static UserModel reconstruct(Long userId, String username, String name, String email,
                                        LocalDate birthDate, String profileImageKey, String defaultAvatarColor,
                                        UserRole role, UserStatus status,
                                        OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        return new UserModel(userId, username, name, email, birthDate, profileImageKey, defaultAvatarColor,
                role, status, createdAt, updatedAt);
    }

    /** 기존 호출부 호환용 생년월일 없는 복원 */
    public static UserModel reconstruct(Long userId, String username, String name, String email,
                                       UserRole role, UserStatus status,
                                       OffsetDateTime createdAt, OffsetDateTime updatedAt) {
        return reconstruct(userId, username, name, email, null, role, status, createdAt, updatedAt);
    }

    /**
     * 사용자 프로필 수정
     */
    public UserModel updateProfile(String username, String name, String email, LocalDate birthDate) {
        if (status == UserStatus.WITHDRAWN) {
            throw new CoreException(ErrorType.CONFLICT, "탈퇴한 사용자는 수정할 수 없습니다. userId=" + userId);
        }
        return new UserModel(userId, username, name, email, birthDate, profileImageKey, defaultAvatarColor, role, status, createdAt, OffsetDateTime.now());
    }

    /** 기존 호출부 호환용 생년월일 유지 */
    public UserModel updateProfile(String username, String name, String email) {
        return updateProfile(username, name, email, birthDate);
    }

    public UserModel updateProfileImage(String imageKey) {
        if (status == UserStatus.WITHDRAWN) {
            throw new CoreException(ErrorType.CONFLICT, "탈퇴한 사용자는 수정할 수 없습니다. userId=" + userId);
        }
        return new UserModel(userId, username, name, email, birthDate, imageKey, defaultAvatarColor,
                role, status, createdAt, OffsetDateTime.now());
    }

    public String getProfileImageKey() {
        return profileImageKey;
    }

    public String getDefaultAvatarColor() {
        return defaultAvatarColor;
    }

    /**
     * 사용자 탈퇴 상태 변경
     */
    public UserModel withdraw() {
        if (status == UserStatus.WITHDRAWN) {
            throw new CoreException(ErrorType.CONFLICT, "이미 탈퇴한 사용자입니다. userId=" + userId);
        }
        return new UserModel(userId, username, name, email, birthDate, profileImageKey, defaultAvatarColor, role, UserStatus.WITHDRAWN, createdAt, OffsetDateTime.now());
    }

    /**
     * username 필수값, 길이, 공백 및 제어문자 검증
     */
    private void validateUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new CoreException(ErrorType.BAD_REQUEST, "username은 필수입니다.");
        }
        if (username.length() < USERNAME_MIN_LENGTH || username.length() > USERNAME_MAX_LENGTH) {
            throw new CoreException(ErrorType.BAD_REQUEST, "username은 2자 이상 30자 이하여야 합니다.");
        }
        if (!username.equals(username.strip())) {
            throw new CoreException(ErrorType.BAD_REQUEST, "username은 앞뒤에 공백을 사용할 수 없습니다.");
        }
        if (username.contains("  ")) {
            throw new CoreException(ErrorType.BAD_REQUEST, "username은 연속된 공백을 사용할 수 없습니다.");
        }
        if (CONTROL_CHAR_PATTERN.matcher(username).matches()) {
            throw new CoreException(ErrorType.BAD_REQUEST, "username에는 개행이나 제어문자를 사용할 수 없습니다.");
        }
    }

    /**
     * name 형식 및 길이 검증 (소셜 가입자는 null 허용)
     */
    private void validateName(String name) {
        if (name == null) {
            return;
        }
        if (name.length() < NAME_MIN_LENGTH || name.length() > NAME_MAX_LENGTH) {
            throw new CoreException(ErrorType.BAD_REQUEST, "name은 2자 이상 30자 이하여야 합니다.");
        }
        if (!NAME_PATTERN.matcher(name).matches()) {
            throw new CoreException(ErrorType.BAD_REQUEST, "name은 한글만 사용할 수 있습니다.");
        }
    }

    /**
     * email 형식 및 길이 검증
     */
    public static void validateEmail(String email) {
        if (email == null) {
            return;
        }
        if (email.isBlank()) {
            throw new CoreException(ErrorType.BAD_REQUEST, "email은 공백일 수 없습니다.");
        }
        if (email.length() > EMAIL_MAX_LENGTH) {
            throw new CoreException(ErrorType.BAD_REQUEST, "email은 255자 이하여야 합니다.");
        }
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new CoreException(ErrorType.BAD_REQUEST, "email 형식이 올바르지 않습니다.");
        }
    }

    public Long getUserId() {
        return userId;
    }

    public String getUsername() {
        return username;
    }

    public String getName() {
        return name;
    }

    public String getEmail() {
        return email;
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    public UserRole getRole() {
        return role;
    }

    public UserStatus getStatus() {
        return status;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }
}
