package taedonghee.plan_fix.application.user;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.*;
import taedonghee.plan_fix.domain.user.*;
import taedonghee.plan_fix.infrastructure.s3.S3Properties;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class ProfileImageApplicationServiceTest {
    private static final String OLD_KEY = "users/7/profile/00000000-0000-0000-0000-000000000007.png";
    private final UserRepository users = mock(UserRepository.class);
    private final S3Client s3 = mock(S3Client.class);
    @SuppressWarnings("unchecked") private final ObjectProvider<S3Client> provider = mock(ObjectProvider.class);
    private ProfileImageApplicationService service;
    private byte[] png;

    @BeforeEach
    void setUp() throws Exception {
        when(provider.getIfAvailable()).thenReturn(s3);
        when(users.findByUserId(7L)).thenReturn(Optional.of(user(OLD_KEY)));
        when(users.findByUserIdForUpdate(7L)).thenReturn(Optional.of(user(OLD_KEY)));
        when(users.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        service = new ProfileImageApplicationService(users, provider, new S3Properties("test-bucket", "ap-northeast-2", null, null));
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", output);
        png = output.toByteArray();
    }

    @Test
    void uploadUsesActualMimeAndUniquePrivateKeyAndPreservesColor() {
        UserResult result = service.upload(7L, file(png, "application/octet-stream"));
        verify(users).findByUserIdForUpdate(7L);
        verify(users, never()).findByUserId(any());
        ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3).putObject(request.capture(), any(RequestBody.class));
        assertThat(request.getValue().bucket()).isEqualTo("test-bucket");
        assertThat(request.getValue().key()).matches("users/7/profile/[a-f0-9-]{36}\\.png");
        assertThat(request.getValue().contentType()).isEqualTo("image/png");
        assertThat(request.getValue().acl()).isNull();
        assertThat(result.defaultAvatarColor()).isEqualTo("rose");
        assertThat(result.profileImageUrl()).startsWith("/api/v1/users/me/profile-image?v=").endsWith(".png");
        verify(s3).deleteObject(DeleteObjectRequest.builder().bucket("test-bucket").key(OLD_KEY).build());
    }

    @Test
    void deletionRestoresTheSameDefaultAvatar() {
        UserResult result = service.remove(7L);
        verify(users).findByUserIdForUpdate(7L);
        verify(users, never()).findByUserId(any());
        assertThat(result.profileImageUrl()).isNull();
        assertThat(result.defaultAvatarColor()).isEqualTo("rose");
        verify(s3).deleteObject(DeleteObjectRequest.builder().bucket("test-bucket").key(OLD_KEY).build());
    }

    @Test
    void getReadsOnlyTheRequestedUsersPersistedKey() {
        when(s3.getObjectAsBytes(any(GetObjectRequest.class))).thenReturn(
                ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), png));
        var result = service.get(7L);
        assertThat(result.bytes()).containsExactly(png);
        assertThat(result.contentType()).isEqualTo("image/png");
        verify(s3).getObjectAsBytes(GetObjectRequest.builder().bucket("test-bucket").key(OLD_KEY).build());
    }

    @Test
    void missingPhotoIs404WithoutTouchingS3() {
        when(users.findByUserId(7L)).thenReturn(Optional.of(user(null)));
        assertThatThrownBy(() -> service.get(7L)).isInstanceOfSatisfying(CoreException.class,
                ex -> assertThat(ex.getErrorType()).isEqualTo(ErrorType.NOT_FOUND));
        verifyNoInteractions(provider, s3);
    }

    @Test
    void keyFromAnotherUsersDirectoryIsNeverServed() {
        when(users.findByUserId(7L)).thenReturn(Optional.of(user(OLD_KEY.replace("users/7/", "users/8/"))));
        assertThatThrownBy(() -> service.get(7L)).isInstanceOf(CoreException.class);
        verifyNoInteractions(s3);
    }

    @Test
    void failedUploadDoesNotSaveProfileOrDeleteOldPhoto() {
        when(s3.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(S3Exception.builder().statusCode(503).build());
        assertThatThrownBy(() -> service.upload(7L, file(png, "image/png"))).isInstanceOf(CoreException.class);
        verify(users, never()).save(any());
        verify(s3, never()).deleteObject(any(DeleteObjectRequest.class));
    }

    @Test
    void rollbackRemovesNewPhotoAndKeepsOldPhoto() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            service.upload(7L, file(png, "image/png"));
            ArgumentCaptor<PutObjectRequest> request = ArgumentCaptor.forClass(PutObjectRequest.class);
            verify(s3).putObject(request.capture(), any(RequestBody.class));
            verify(s3, never()).deleteObject(any(DeleteObjectRequest.class));
            TransactionSynchronizationManager.getSynchronizations().forEach(sync ->
                    sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
            verify(s3).deleteObject(DeleteObjectRequest.builder().bucket("test-bucket").key(request.getValue().key()).build());
            verify(s3, never()).deleteObject(DeleteObjectRequest.builder().bucket("test-bucket").key(OLD_KEY).build());
        } finally { TransactionSynchronizationManager.clearSynchronization(); }
    }

    @Test
    void rejectsEmptyOversizeSpoofedSvgAndTruncatedImages() {
        for (byte[] invalid : new byte[][] {new byte[0], new byte[ProfileImageValidator.MAX_BYTES + 1],
                "<svg onload='alert(1)'/>".getBytes(), {(byte) 0xff, (byte) 0xd8, (byte) 0xff}}) {
            assertThatThrownBy(() -> service.upload(7L, file(invalid, "image/jpeg")))
                    .isInstanceOfSatisfying(CoreException.class,
                            ex -> assertThat(ex.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST));
        }
        verify(users, never()).save(any());
        verifyNoInteractions(s3);
    }

    @Test
    void corruptWebpIsRejectedWithoutReplacingExistingPhoto() {
        byte[] corrupt = Base64.getDecoder().decode("UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAA=");
        assertThatThrownBy(() -> service.upload(7L, file(corrupt, "image/webp")))
                .isInstanceOfSatisfying(CoreException.class,
                        ex -> assertThat(ex.getErrorType()).isEqualTo(ErrorType.BAD_REQUEST));
        verify(users, never()).save(any());
        verifyNoInteractions(s3);
    }

    @Test
    void validatesRealJpegAndWebpFiles() throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "jpg", output);
        assertThat(ProfileImageValidator.validate(file(output.toByteArray(), "image/jpeg")).contentType()).isEqualTo("image/jpeg");
        byte[] webp = Base64.getDecoder().decode("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
        assertThat(ProfileImageValidator.validate(file(webp, "image/webp")).contentType()).isEqualTo("image/webp");
        webp[4] = 0;
        assertThatThrownBy(() -> ProfileImageValidator.validate(file(webp, "image/webp"))).isInstanceOf(CoreException.class);
    }

    private MockMultipartFile file(byte[] bytes, String contentType) {
        return new MockMultipartFile("file", "untrusted-filename.svg", contentType, bytes);
    }
    private UserModel user(String key) {
        var now = OffsetDateTime.now();
        return UserModel.reconstruct(7L, "traveler", null, null, null, key, "rose", UserRole.USER, UserStatus.ACTIVE, now, now);
    }
}
