package taedonghee.plan_fix.domain.user;

import java.util.List;
import java.util.Optional;

/**
 * 사용자 Repository
 */
public interface UserRepository {

    /**
     * 사용자 저장
     */
    UserModel save(UserModel user);

    /**
     * user_id 기반 사용자 단건 조회
     */
    Optional<UserModel> findByUserId(Long userId);

    /** Serialize profile mutations so photo and text edits cannot overwrite each other. */
    default Optional<UserModel> findByUserIdForUpdate(Long userId) {
        return findByUserId(userId);
    }

    /**
     * email 기반 사용자 단건 조회
     */
    Optional<UserModel> findByEmail(String email);

    /**
     * 사용자 전체 조회
     */
    List<UserModel> findAll();

    /**
     * username 존재 여부 조회
     */
    boolean existsByUsername(String username);

    /**
     * email 존재 여부 조회
     */
    boolean existsByEmail(String email);
}
