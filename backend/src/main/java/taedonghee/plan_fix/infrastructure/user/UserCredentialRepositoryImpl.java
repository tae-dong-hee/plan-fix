package taedonghee.plan_fix.infrastructure.user;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import taedonghee.plan_fix.domain.user.UserCredentialModel;
import taedonghee.plan_fix.domain.user.UserCredentialRepository;

import java.util.Optional;

/**
 * UserCredentialRepository JPA 구현체
 */
@Repository
@RequiredArgsConstructor
public class UserCredentialRepositoryImpl implements UserCredentialRepository {

    private final UserCredentialJpaRepository userCredentialJpaRepository;
    private final UserJpaRepository userJpaRepository;

    /**
     * 자체 로그인 인증정보 저장 처리
     */
    @Override
    public UserCredentialModel save(UserCredentialModel credential) {
        UserJpaEntity user = userJpaRepository.getReferenceById(credential.getUserId());
        UserCredentialJpaEntity saved = userCredentialJpaRepository.save(toEntity(credential, user));
        return toDomain(saved);
    }

    /**
     * login_id 기반 인증정보 조회 처리
     */
    @Override
    public Optional<UserCredentialModel> findByLoginId(String loginId) {
        return userCredentialJpaRepository.findByLoginId(loginId).map(this::toDomain);
    }

    @Override
    public Optional<UserCredentialModel> findByLoginIdForUpdate(String loginId) {
        return userCredentialJpaRepository.findByLoginIdForUpdate(loginId).map(this::toDomain);
    }

    /**
     * login_id 존재 여부 조회 처리
     */
    @Override
    public boolean existsByLoginId(String loginId) {
        return userCredentialJpaRepository.existsByLoginId(loginId);
    }

    /**
     * 도메인 모델을 JPA 엔티티로 변환
     */
    private UserCredentialJpaEntity toEntity(UserCredentialModel credential, UserJpaEntity user) {
        return UserCredentialJpaEntity.builder()
                .id(credential.getUserCredentialId())
                .user(user)
                .loginId(credential.getLoginId())
                .password(credential.getPassword())
                .lastLoginAt(credential.getLastLoginAt())
                .createdAt(credential.getCreatedAt())
                .updatedAt(credential.getUpdatedAt())
                .build();
    }

    /**
     * JPA 엔티티를 도메인 모델로 변환
     */
    private UserCredentialModel toDomain(UserCredentialJpaEntity entity) {
        return UserCredentialModel.reconstruct(
                entity.getId(),
                entity.getUser().getId(),
                entity.getLoginId(),
                entity.getPassword(),
                entity.getLastLoginAt(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }
}
