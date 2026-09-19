package taedonghee.plan_fix.infrastructure.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;

/**
 * user_credentials 테이블 Spring Data JPA Repository
 */
public interface UserCredentialJpaRepository extends JpaRepository<UserCredentialJpaEntity, Long> {

    /**
     * login_id 기반 인증정보 조회
     */
    Optional<UserCredentialJpaEntity> findByLoginId(String loginId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from UserCredentialJpaEntity c where c.loginId = :loginId")
    Optional<UserCredentialJpaEntity> findByLoginIdForUpdate(@Param("loginId") String loginId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from UserCredentialJpaEntity c where c.user.id = :userId")
    Optional<UserCredentialJpaEntity> findByUserIdForUpdate(@Param("userId") Long userId);

    /**
     * login_id 존재 여부 조회
     */
    boolean existsByLoginId(String loginId);
}
