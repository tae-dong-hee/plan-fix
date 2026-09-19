package taedonghee.plan_fix.infrastructure.auth;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface PhoneRateLimitJpaRepository extends JpaRepository<PhoneRateLimitJpaEntity, String> {
    @Modifying
    @Query(value = "insert into phone_verification_rate_limits (bucket_key, window_started_at, request_count) values (:key, current_timestamp, 0) on conflict (bucket_key) do nothing", nativeQuery = true)
    void initialize(@Param("key") String key);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from PhoneRateLimitJpaEntity r where r.bucketKey = :key")
    PhoneRateLimitJpaEntity findForUpdate(@Param("key") String key);
}
