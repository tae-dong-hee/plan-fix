package taedonghee.plan_fix.application.user;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.user.PasswordEncryptor;
import taedonghee.plan_fix.domain.user.UserCredentialModel;
import taedonghee.plan_fix.domain.user.UserCredentialRepository;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;

class UserApplicationServiceTest {

    @Test
    void profileEditLocksCurrentUserAndPreservesTheirPhoto() {
        UserRepository users = mock(UserRepository.class);
        var now = java.time.OffsetDateTime.now();
        UserModel user = UserModel.reconstruct(7L, "traveler", null, null, null,
                "users/7/profile/photo.png", "green", taedonghee.plan_fix.domain.user.UserRole.USER,
                taedonghee.plan_fix.domain.user.UserStatus.ACTIVE, now, now);
        when(users.findByUserIdForUpdate(7L)).thenReturn(Optional.of(user));
        when(users.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        var service = new UserApplicationService(users, new StubCredentialRepository(), new PlainPasswordEncryptor());
        var result = service.update(7L, new UserCommand.Update("traveler2", null, null, null));
        assertThat(result.defaultAvatarColor()).isEqualTo("green");
        assertThat(result.profileImageUrl()).endsWith("photo.png");
        verify(users).findByUserIdForUpdate(7L);
        verify(users, never()).findByUserId(any());
    }


    @Test
    void 자체_가입은_username을_loginId로_초기화하고_name을_저장한다() {
        InMemoryUserRepository users = new InMemoryUserRepository();
        UserApplicationService service = new UserApplicationService(
                users, new StubCredentialRepository(), new PlainPasswordEncryptor());

        UserResult result = service.create(
                new UserCommand.Create("gildong01", "홍길동", "a@b.com", "gildong01", "pass1234"));

        assertThat(result.username()).isEqualTo("gildong01");
        assertThat(result.name()).isEqualTo("홍길동");
    }

    static class InMemoryUserRepository implements UserRepository {
        private final List<UserModel> saved = new ArrayList<>();
        private long sequence = 0;

        @Override
        public UserModel save(UserModel user) {
            UserModel stored = UserModel.reconstruct(
                    user.getUserId() == null ? ++sequence : user.getUserId(),
                    user.getUsername(), user.getName(), user.getEmail(),
                    user.getRole(), user.getStatus(), user.getCreatedAt(), user.getUpdatedAt());
            saved.add(stored);
            return stored;
        }

        @Override
        public Optional<UserModel> findByUserId(Long userId) {
            return saved.stream().filter(u -> u.getUserId().equals(userId)).findFirst();
        }

        @Override
        public Optional<UserModel> findByEmail(String email) {
            return saved.stream().filter(u -> email.equals(u.getEmail())).findFirst();
        }

        @Override
        public List<UserModel> findAll() {
            return List.copyOf(saved);
        }

        @Override
        public boolean existsByUsername(String username) {
            return saved.stream().anyMatch(u -> u.getUsername().equals(username));
        }

        @Override
        public boolean existsByEmail(String email) {
            return saved.stream().anyMatch(u -> email.equals(u.getEmail()));
        }
    }

    static class StubCredentialRepository implements UserCredentialRepository {
        @Override
        public UserCredentialModel save(UserCredentialModel credential) {
            return credential;
        }

        @Override
        public Optional<UserCredentialModel> findByLoginId(String loginId) {
            return Optional.empty();
        }

        @Override
        public boolean existsByLoginId(String loginId) {
            return false;
        }
    }

    static class PlainPasswordEncryptor implements PasswordEncryptor {
        @Override
        public String encrypt(String rawPassword) {
            return rawPassword;
        }

        @Override
        public boolean matches(String rawPassword, String encryptedPassword) {
            return rawPassword.equals(encryptedPassword);
        }
    }
}
