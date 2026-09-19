package taedonghee.plan_fix.application.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.user.PasswordEncryptor;
import taedonghee.plan_fix.domain.user.UserCredentialModel;
import taedonghee.plan_fix.domain.user.UserCredentialRepository;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

/**
 * 인증 관련 Application Service
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthApplicationService {

    private final UserCredentialRepository userCredentialRepository;
    private final UserRepository userRepository;
    private final PasswordEncryptor passwordEncryptor;
    private final AuthTokenProvider authTokenProvider;

    /**
     * 자체 로그인 인증 및 토큰 발급 처리
     */
    @Transactional
    public AuthResult login(AuthCommand.Login command) {
        UserCredentialModel credential = userCredentialRepository.findByLoginIdForUpdate(command.loginId())
                .orElseThrow(() -> new CoreException(ErrorType.UNAUTHORIZED, "아이디 또는 비밀번호가 일치하지 않습니다."));

        if (!passwordEncryptor.matches(command.password(), credential.getPassword())) {
            throw new CoreException(ErrorType.UNAUTHORIZED, "아이디 또는 비밀번호가 일치하지 않습니다.");
        }

        UserModel user = userRepository.findByUserId(credential.getUserId())
                .orElseThrow(() -> new CoreException(ErrorType.UNAUTHORIZED, "아이디 또는 비밀번호가 일치하지 않습니다."));

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new CoreException(ErrorType.FORBIDDEN, "Inactive user cannot login. userId=" + user.getUserId());
        }

        userCredentialRepository.save(credential.markLoggedIn());
        return AuthResult.of(authTokenProvider.create(user), user);
    }
}
