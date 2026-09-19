package taedonghee.plan_fix.application.user;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.infrastructure.s3.S3Properties;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.UUID;

/** Stores profile images in private S3 and serves the user's current avatar through the API. */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProfileImageApplicationService {
    private final UserRepository userRepository;
    private final ObjectProvider<S3Client> s3ClientProvider;
    private final S3Properties s3Properties;

    @Transactional
    public UserResult upload(Long userId, MultipartFile file) {
        UserModel user = getUserForUpdate(userId);
        var image = ProfileImageValidator.validate(file);
        String key = "users/" + userId + "/profile/" + UUID.randomUUID() + "." + image.extension();
        UserModel updated = user.updateProfileImage(key);
        S3Client client = client();
        try {
            client.putObject(PutObjectRequest.builder().bucket(s3Properties.bucket()).key(key)
                    .contentType(image.contentType()).contentLength((long) image.bytes().length).build(),
                    RequestBody.fromBytes(image.bytes()));
        } catch (SdkException exception) {
            throw unavailable();
        }
        boolean transaction = TransactionSynchronizationManager.isSynchronizationActive();
        if (transaction) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    removeQuietly(client, status == STATUS_COMMITTED ? user.getProfileImageKey() : key);
                }
            });
        }
        try {
            var result = UserResult.from(userRepository.save(updated));
            if (!transaction) removeQuietly(client, user.getProfileImageKey());
            return result;
        } catch (RuntimeException exception) {
            if (!transaction) removeQuietly(client, key);
            throw exception;
        }
    }

    @Transactional
    public UserResult remove(Long userId) {
        UserModel user = getUserForUpdate(userId);
        if (user.getProfileImageKey() == null) return UserResult.from(user);
        S3Client client = client();
        var result = UserResult.from(userRepository.save(user.updateProfileImage(null)));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { removeQuietly(client, user.getProfileImageKey()); }
            });
        } else {
            removeQuietly(client, user.getProfileImageKey());
        }
        return result;
    }

    @Transactional(readOnly = true)
    public ProfileImage get(Long userId) {
        String key = getUser(userId).getProfileImageKey();
        if (key == null) throw new CoreException(ErrorType.NOT_FOUND, "등록된 프로필 사진이 없습니다.");
        // A persisted key must belong to this user and contain only server-generated filenames.
        if (!key.matches("users/" + userId + "/profile/[a-f0-9-]{36}\\.(jpg|png|webp)")) throw unavailable();
        try {
            byte[] bytes = client().getObjectAsBytes(GetObjectRequest.builder()
                    .bucket(s3Properties.bucket()).key(key).build()).asByteArray();
            if (bytes.length == 0 || bytes.length > ProfileImageValidator.MAX_BYTES) throw unavailable();
            String contentType = key.endsWith(".jpg") ? "image/jpeg" : key.endsWith(".png") ? "image/png" : "image/webp";
            return new ProfileImage(bytes, contentType);
        } catch (SdkException exception) {
            throw unavailable();
        }
    }

    private UserModel getUserForUpdate(Long userId) {
        return userRepository.findByUserIdForUpdate(userId)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "사용자를 찾을 수 없습니다."));
    }

    private UserModel getUser(Long userId) {
        return userRepository.findByUserId(userId)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "사용자를 찾을 수 없습니다."));
    }

    private S3Client client() {
        S3Client client = s3ClientProvider.getIfAvailable();
        if (client == null || s3Properties.bucket() == null || s3Properties.bucket().isBlank()) throw unavailable();
        return client;
    }

    private void removeQuietly(S3Client client, String key) {
        if (key == null) return;
        try {
            client.deleteObject(DeleteObjectRequest.builder().bucket(s3Properties.bucket()).key(key).build());
        } catch (SdkException exception) {
            log.warn("이전 프로필 사진 정리 실패: {} ({})", key, exception.getClass().getSimpleName());
        }
    }

    private static CoreException unavailable() {
        return new CoreException(ErrorType.INTERNAL_ERROR, "프로필 사진을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }

    public record ProfileImage(byte[] bytes, String contentType) { }
}
