package taedonghee.plan_fix.infrastructure.user;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;

import java.util.List;
import java.util.Optional;

/**
 * UserRepository JPA 구현체
 */
@Repository
@RequiredArgsConstructor
public class UserRepositoryImpl implements UserRepository {

    private final UserJpaRepository userJpaRepository;

    /**
     * 사용자 저장 처리
     */
    @Override
    public UserModel save(UserModel user) {
        return toDomain(userJpaRepository.save(toEntity(user)));
    }

    /**
     * user_id 기반 사용자 단건 조회 처리
     */
    @Override
    public Optional<UserModel> findByUserId(Long userId) {
        return userJpaRepository.findById(userId).map(this::toDomain);
    }

    @Override
    public Optional<UserModel> findByUserIdForUpdate(Long userId) {
        return userJpaRepository.findByIdForUpdate(userId).map(this::toDomain);
    }

    /**
     * email 기반 사용자 단건 조회 처리
     */
    @Override
    public Optional<UserModel> findByEmail(String email) {
        return userJpaRepository.findByEmail(email).map(this::toDomain);
    }

    /**
     * 사용자 전체 조회 처리
     */
    @Override
    public List<UserModel> findAll() {
        return userJpaRepository.findAll().stream()
                .map(this::toDomain)
                .toList();
    }

    /**
     * username 존재 여부 조회 처리
     */
    @Override
    public boolean existsByUsername(String username) {
        return userJpaRepository.existsByUsername(username);
    }

    /**
     * email 존재 여부 조회 처리
     */
    @Override
    public boolean existsByEmail(String email) {
        return userJpaRepository.existsByEmail(email);
    }

    /**
     * 도메인 모델을 JPA 엔티티로 변환
     */
    private UserJpaEntity toEntity(UserModel user) {
        return UserJpaEntity.builder()
                .id(user.getUserId())
                .username(user.getUsername())
                .name(user.getName())
                .email(user.getEmail())
                .birthDate(user.getBirthDate())
                .profileImageKey(user.getProfileImageKey())
                .defaultAvatarColor(user.getDefaultAvatarColor())
                .role(user.getRole())
                .status(user.getStatus())
                .createdAt(user.getCreatedAt())
                .updatedAt(user.getUpdatedAt())
                .build();
    }

    /**
     * JPA 엔티티를 도메인 모델로 변환
     */
    private UserModel toDomain(UserJpaEntity entity) {
        return UserModel.reconstruct(
                entity.getId(),
                entity.getUsername(),
                entity.getName(),
                entity.getEmail(),
                entity.getBirthDate(),
                entity.getProfileImageKey(),
                entity.getDefaultAvatarColor(),
                entity.getRole(),
                entity.getStatus(),
                entity.getCreatedAt(),
                entity.getUpdatedAt()
        );
    }
}
