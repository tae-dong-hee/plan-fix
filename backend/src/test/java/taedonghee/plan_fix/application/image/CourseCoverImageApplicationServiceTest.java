package taedonghee.plan_fix.application.image;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.io.ByteArrayResource;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.S3Exception;
import taedonghee.plan_fix.infrastructure.s3.S3Properties;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CourseCoverImageApplicationServiceTest {

    private static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, (byte) 0xd9};
    private static final String ID = "pyeongchang-meadow";
    private static final String KEY = "defaults/course-covers/2026-09-v1/" + ID + ".jpg";

    private final S3Client s3Client = mock(S3Client.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<S3Client> provider = mock(ObjectProvider.class);
    private final ObjectMapper mapper = new ObjectMapper();
    private CourseCoverImageApplicationService service;
    private String sha;

    @BeforeEach
    void setUp() throws Exception {
        sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JPEG));
        when(provider.getIfAvailable()).thenReturn(s3Client);
        service = serviceFor(List.of(entry(ID, KEY, sha)));
    }

    @Test
    void readsOnlyRegisteredKeyAndReusesBytesFromCache() {
        when(s3Client.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenReturn(ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), JPEG));

        var first = service.get(ID);
        var second = service.get(ID);

        assertThat(first.bytes()).containsExactly(JPEG);
        assertThat(first.sha256()).isEqualTo(sha);
        assertThat(first.version()).isEqualTo("2026-09-v1");
        assertThat(second).isSameAs(first);
        verify(s3Client, times(1)).getObjectAsBytes(GetObjectRequest.builder()
                .bucket("test-course-bucket").key(KEY).build());
    }

    @Test
    void rejectsUnknownIdsBeforeTouchingS3() {
        assertThatThrownBy(() -> service.get("boards/private-user-photo.jpg"))
                .isInstanceOfSatisfying(CoreException.class,
                        exception -> assertThat(exception.getErrorType()).isEqualTo(ErrorType.NOT_FOUND));
        verifyNoInteractions(s3Client, provider);
    }

    @Test
    void failedS3ReadIsNotCachedAndNextRequestCanRecover() {
        when(s3Client.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(503).message("unavailable").build())
                .thenReturn(ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), JPEG));

        assertThatThrownBy(() -> service.get(ID)).isInstanceOfSatisfying(CoreException.class,
                exception -> assertThat(exception.getErrorType()).isEqualTo(ErrorType.INTERNAL_ERROR));
        assertThat(service.get(ID).bytes()).containsExactly(JPEG);
        verify(s3Client, times(2)).getObjectAsBytes(any(GetObjectRequest.class));
    }

    @Test
    void rejectsBytesThatDoNotMatchTheReviewedCatalog() {
        byte[] differentJpeg = {(byte) 0xff, (byte) 0xd8, (byte) 0xff, 0};
        when(s3Client.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenReturn(ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), differentJpeg));

        assertThatThrownBy(() -> service.get(ID)).isInstanceOfSatisfying(CoreException.class,
                exception -> assertThat(exception.getErrorType()).isEqualTo(ErrorType.INTERNAL_ERROR));
    }

    @Test
    void missingS3ConfigurationReturnsControlledFailure() {
        when(provider.getIfAvailable()).thenReturn(null);

        assertThatThrownBy(() -> service.get(ID)).isInstanceOfSatisfying(CoreException.class,
                exception -> assertThat(exception.getErrorType()).isEqualTo(ErrorType.INTERNAL_ERROR));
        verifyNoInteractions(s3Client);
    }

    @Test
    void catalogCannotExposeOtherBucketKeys() {
        assertThatThrownBy(() -> serviceFor(List.of(entry(ID, "boards/" + ID + ".jpg", sha))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void catalogCannotExceedCacheCapacity() {
        var images = java.util.stream.IntStream.rangeClosed(1, 41).mapToObj(number -> {
            String id = "cover-" + number;
            return entry(id, "defaults/course-covers/2026-09-v1/" + id + ".jpg", sha);
        }).toList();

        assertThatThrownBy(() -> serviceFor(images)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void expanded_catalog_can_read_last_image_from_its_own_version_path() throws Exception {
        var images = java.util.stream.IntStream.rangeClosed(1, 40).mapToObj(number -> {
            String id = "cover-" + number;
            return entry(id, "defaults/course-covers/2026-09-v2/" + id + ".jpg", sha);
        }).toList();
        var expanded = serviceFor(images);
        when(s3Client.getObjectAsBytes(any(GetObjectRequest.class)))
                .thenReturn(ResponseBytes.fromByteArray(GetObjectResponse.builder().build(), JPEG));

        assertThat(expanded.get("cover-40").version()).isEqualTo("2026-09-v2");
        verify(s3Client).getObjectAsBytes(GetObjectRequest.builder().bucket("test-course-bucket")
                .key("defaults/course-covers/2026-09-v2/cover-40.jpg").build());
    }

    private Map<String, String> entry(String id, String key, String checksum) {
        return Map.of("id", id, "s3Key", key, "sha256", checksum,
                "url", "https://example.com/" + key, "author", "Test photographer");
    }

    private CourseCoverImageApplicationService serviceFor(List<Map<String, String>> images) throws Exception {
        String json = mapper.writeValueAsString(Map.of("version", 1, "images", images));
        return new CourseCoverImageApplicationService(provider,
                new S3Properties("test-course-bucket", "ap-northeast-2", null, null), mapper,
                new ByteArrayResource(json.getBytes(StandardCharsets.UTF_8)));
    }
}
