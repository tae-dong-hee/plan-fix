package taedonghee.plan_fix.infrastructure.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PasswordResetJpaRepository extends JpaRepository<PasswordResetJpaEntity, Long> {
    // Only read the scalar before taking the credential lock. Loading the entity here
    // would leave stale token state in the persistence context after a concurrent reset.
    @Query("select r.userId from PasswordResetJpaEntity r where r.tokenHash = :tokenHash")
    Optional<Long> findUserIdByTokenHash(@Param("tokenHash") String tokenHash);

    @Query("select r.sessionVersion from PasswordResetJpaEntity r where r.userId = :userId")
    Optional<Long> findSessionVersion(@Param("userId") Long userId);
}
