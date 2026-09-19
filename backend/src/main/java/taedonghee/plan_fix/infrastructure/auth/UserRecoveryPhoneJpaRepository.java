package taedonghee.plan_fix.infrastructure.auth;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface UserRecoveryPhoneJpaRepository extends JpaRepository<UserRecoveryPhoneJpaEntity, Long> {
    Optional<UserRecoveryPhoneJpaEntity> findByPhoneNumber(String phoneNumber);

    @Query("select p.userId from UserRecoveryPhoneJpaEntity p where p.phoneNumber = :phone")
    Optional<Long> findUserIdByPhoneNumber(@Param("phone") String phoneNumber);
}
