package taedonghee.plan_fix.application.user;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.user.PasswordEncryptor;
import taedonghee.plan_fix.domain.user.UserCredentialModel;
import taedonghee.plan_fix.domain.user.UserCredentialRepository;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;
import java.time.LocalDate;

/**
 * 사용자 Application Service
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserApplicationService {

    private final UserRepository userRepository;
    private final UserCredentialRepository userCredentialRepository;
    private final PasswordEncryptor passwordEncryptor;

    /**
     * 사용자 생성 처리
     */
    @Transactional
    public UserResult create(UserCommand.Create command) {
        UserCredentialModel.validateLoginId(command.loginId()); // 로그인 아이디 형식 검증
        UserCredentialModel.validateRawPassword(command.password()); // 비밀번호 형식 검증

        // 자체 가입은 닉네임 입력란이 없으므로 loginId를 username 초기값으로 사용한다
        String username = command.username() == null ? command.loginId() : command.username();
        UserModel newUser = UserModel.create(username, command.name(), command.email(), command.birthDate()); // 사용자 도메인 모델 생성

        validateUniqueUsername(username); // username 중복 검증
        validateUniqueEmail(command.email()); // email 중복 검증
        validateUniqueLoginId(command.loginId()); // login_id 중복 검증

        UserModel savedUser = userRepository.save(newUser);
        String encryptedPassword = passwordEncryptor.encrypt(command.password()); // 비밀번호 암호화
        userCredentialRepository.save(UserCredentialModel.create(savedUser.getUserId(), command.loginId(), encryptedPassword)); // 사용자 인증정보 저장

        return UserResult.from(savedUser);
    }

    /**
     * 사용자 프로필 수정 처리
     */
    @Transactional
    public UserResult update(Long userId, UserCommand.Update command) {
        UserModel user = getOrThrow(userId);
        if (!user.getUsername().equals(command.username())) {
            validateUniqueUsername(command.username());
        }
        if (command.email() != null && !command.email().equals(user.getEmail())) {
            validateUniqueEmail(command.email());
        }
        return UserResult.from(userRepository.save(user.updateProfile(command.username(), command.name(), command.email(), command.birthDate())));
    }

    /**
     * 사용자 탈퇴 상태 변경 처리
     */
    @Transactional
    public UserResult withdraw(Long userId) {
        return UserResult.from(userRepository.save(getOrThrow(userId).withdraw()));
    }

    /**
     * 사용자 단건 조회 처리
     */
    public UserResult get(Long userId) {
        return UserResult.from(getOrThrow(userId));
    }

    /**
     * 사용자 전체 조회 처리
     */
    public List<UserResult> getAll() {
        return userRepository.findAll().stream()
                .map(UserResult::from)
                .toList();
    }

    /** 회원가입 전 아이디 사용 가능 여부를 조회한다. */
    public boolean isUsernameAvailable(String username) {
        return username != null
                && !username.isBlank()
                // 자체 가입 시 아이디가 닉네임 초기값으로도 사용되므로 두 컬럼 모두 확인한다.
                && !userCredentialRepository.existsByLoginId(username)
                && !userRepository.existsByUsername(username);
    }

    /**
     * 사용자 조회 실패 예외 처리
     */
    private UserModel getOrThrow(Long userId) {
        return userRepository.findByUserId(userId)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "User not found. userId=" + userId));
    }

    /**
     * username 중복 검증
     */
    private void validateUniqueUsername(String username) {
        if (userRepository.existsByUsername(username)) {
            throw new CoreException(ErrorType.CONFLICT, "username already exists. username=" + username);
        }
    }

    /**
     * email 중복 검증
     */
    private void validateUniqueEmail(String email) {
        if (email != null && userRepository.existsByEmail(email)) {
            throw new CoreException(ErrorType.CONFLICT, "email already exists. email=" + email);
        }
    }

    /**
     * login_id 중복 검증
     */
    private void validateUniqueLoginId(String loginId) {
        if (loginId != null && userCredentialRepository.existsByLoginId(loginId)) {
            throw new CoreException(ErrorType.CONFLICT, "loginId already exists. loginId=" + loginId);
        }
    }
}
