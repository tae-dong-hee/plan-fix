package taedonghee.plan_fix.domain.user;

import java.util.Optional;

/**
 * 자체 로그인 인증정보 Repository
 */
public interface UserCredentialRepository {

    /**
     * 자체 로그인 인증정보 저장
     */
    UserCredentialModel save(UserCredentialModel credential);

    /**
     * login_id 기반 인증정보 조회
     */
    Optional<UserCredentialModel> findByLoginId(String loginId);

    default Optional<UserCredentialModel> findByLoginIdForUpdate(String loginId) {
        return findByLoginId(loginId);
    }

    /**
     * login_id 존재 여부 조회
     */
    boolean existsByLoginId(String loginId);
}
