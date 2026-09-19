package taedonghee.plan_fix.infrastructure.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;
import java.util.List;

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

    /** Legacy email casing may produce multiple local IDs for the same mailbox. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from UserCredentialJpaEntity c join fetch c.user u where lower(u.email) = :email and u.status = taedonghee.plan_fix.domain.user.UserStatus.ACTIVE order by c.id")
    List<UserCredentialJpaEntity> findActiveByEmailForUpdate(@Param("email") String normalizedEmail);

    /**
     * login_id 존재 여부 조회
     */
    boolean existsByLoginId(String loginId);
}
