package taedonghee.plan_fix.infrastructure.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.Optional;

/**
 * users 테이블 Spring Data JPA Repository
 */
public interface UserJpaRepository extends JpaRepository<UserJpaEntity, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from UserJpaEntity u where u.id = :userId")
    Optional<UserJpaEntity> findByIdForUpdate(@Param("userId") Long userId);

    /**
     * username 존재 여부 조회
     */
    boolean existsByUsername(String username);

    /**
     * email 존재 여부 조회
     */
    boolean existsByEmail(String email);

    /**
     * email 기반 사용자 단건 조회
     */
    Optional<UserJpaEntity> findByEmail(String email);
}
