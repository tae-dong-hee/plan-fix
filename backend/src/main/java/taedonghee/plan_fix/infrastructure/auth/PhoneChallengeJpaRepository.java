package taedonghee.plan_fix.infrastructure.auth;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface PhoneChallengeJpaRepository extends JpaRepository<PhoneChallengeJpaEntity, String> {
    @Query("select c.userId from PhoneChallengeJpaEntity c where c.id = :id")
    Optional<Long> findUserId(@Param("id") String id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from PhoneChallengeJpaEntity c where c.id = :id")
    Optional<PhoneChallengeJpaEntity> findForUpdate(@Param("id") String id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from PhoneChallengeJpaEntity c where c.receiptHash = :hash")
    Optional<PhoneChallengeJpaEntity> findReceiptForUpdate(@Param("hash") String hash);

    @Modifying
    @Query("update PhoneChallengeJpaEntity c set c.consumed = true where c.phoneNumber = :phone and c.verified = false and c.consumed = false")
    void invalidatePending(@Param("phone") String phone);
}
