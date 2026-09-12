package taedonghee.plan_fix.application.image;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import taedonghee.plan_fix.infrastructure.s3.S3Properties;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** 비공개 버킷에서 배포용 카탈로그에 등록한 코스 사진만 읽어 제공한다. */
@Slf4j
@Service
public class CourseCoverImageApplicationService {

    private static final int MAX_IMAGES = 20;
    private static final int MAX_IMAGE_BYTES = 5 * 1024 * 1024;

    private final ObjectProvider<S3Client> s3ClientProvider;
    private final S3Properties s3Properties;
    private final Map<String, Image> images;
    private final Map<String, CoverImage> cache = new ConcurrentHashMap<>();

    @Autowired
    public CourseCoverImageApplicationService(ObjectProvider<S3Client> s3ClientProvider,
                                               S3Properties s3Properties, ObjectMapper objectMapper) {
        this(s3ClientProvider, s3Properties, objectMapper, new ClassPathResource("course-cover-images.json"));
    }

    CourseCoverImageApplicationService(ObjectProvider<S3Client> s3ClientProvider,
                                      S3Properties s3Properties, ObjectMapper objectMapper, Resource resource) {
        this.s3ClientProvider = s3ClientProvider;
        this.s3Properties = s3Properties;
        this.images = readCatalog(objectMapper, resource);
    }

    public CoverImage get(String id) {
        Image image = images.get(id);
        if (image == null) {
            throw new CoreException(ErrorType.NOT_FOUND, "코스 대표 사진을 찾을 수 없습니다.");
        }
        // 등록된 ID만 들어오므로 프로세스당 최대 20장, 최대 100MB로 제한된다.
        // computeIfAbsent에서 실패한 요청은 저장하지 않아 다음 요청에서 다시 읽을 수 있다.
        return cache.computeIfAbsent(id, ignored -> load(image));
    }

    private CoverImage load(Image image) {
        S3Client s3Client = s3ClientProvider.getIfAvailable();
        if (s3Client == null || s3Properties.bucket() == null || s3Properties.bucket().isBlank()) {
            throw unavailable();
        }
        try {
            byte[] bytes = s3Client.getObjectAsBytes(GetObjectRequest.builder()
                    .bucket(s3Properties.bucket())
                    .key(image.s3Key())
                    .build()).asByteArray();
            if (bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES
                    || bytes.length < 3 || (bytes[0] & 0xff) != 0xff || (bytes[1] & 0xff) != 0xd8
                    || (bytes[2] & 0xff) != 0xff || !image.sha256().equals(sha256(bytes))) {
                log.warn("코스 대표 사진 검증 실패: {}", image.id());
                throw unavailable();
            }
            String version = image.s3Key().split("/")[2];
            return new CoverImage(bytes, image.sha256(), version);
        } catch (SdkException exception) {
            log.warn("코스 대표 사진 읽기 실패: {} ({})", image.id(), exception.getClass().getSimpleName());
            throw unavailable();
        }
    }

    private static CoreException unavailable() {
        return new CoreException(ErrorType.INTERNAL_ERROR, "코스 대표 사진을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private static Map<String, Image> readCatalog(ObjectMapper mapper, Resource resource) {
        try (InputStream input = resource.getInputStream()) {
            Catalog catalog = mapper.readValue(input, Catalog.class);
            if (catalog.version() != 1 || catalog.images() == null || catalog.images().isEmpty()
                    || catalog.images().size() > MAX_IMAGES) {
                throw new IllegalArgumentException("Course cover catalog must contain 1 to 20 images with version 1.");
            }
            Map<String, Image> images = new HashMap<>();
            for (Image image : catalog.images()) {
                if (image == null || image.id() == null || !image.id().matches("[a-z0-9-]+")
                        || image.s3Key() == null
                        || !image.s3Key().matches("defaults/course-covers/[a-z0-9-]+/" + image.id() + "\\.jpg")
                        || image.sha256() == null || !image.sha256().matches("[a-f0-9]{64}")
                        || images.putIfAbsent(image.id(), image) != null) {
                    throw new IllegalArgumentException("Course cover catalog contains an invalid or duplicate image.");
                }
            }
            return Map.copyOf(images);
        } catch (IOException exception) {
            throw new IllegalStateException("Could not read course cover catalog.", exception);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Catalog(int version, List<Image> images) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record Image(String id, String s3Key, String sha256) { }

    public record CoverImage(byte[] bytes, String sha256, String version) { }
}
