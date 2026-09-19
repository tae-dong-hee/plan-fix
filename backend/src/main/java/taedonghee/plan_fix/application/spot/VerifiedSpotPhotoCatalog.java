package taedonghee.plan_fix.application.spot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 검수 당시의 장소 식별정보가 모두 일치할 때만 대표사진을 보완한다. */
@Component
public class VerifiedSpotPhotoCatalog {

    private static final String CATALOG_RESOURCE = "verified-spot-images.json";

    private final Map<Long, Photo> photosBySpotId;

    @Autowired
    public VerifiedSpotPhotoCatalog(ObjectMapper objectMapper) {
        this(objectMapper, new ClassPathResource(CATALOG_RESOURCE));
    }

    VerifiedSpotPhotoCatalog(ObjectMapper objectMapper, Resource resource) {
        this(readCatalog(objectMapper, resource));
    }

    VerifiedSpotPhotoCatalog(List<Photo> photos) {
        if (photos == null) {
            throw new IllegalArgumentException("Verified spot photo catalog requires an images array.");
        }
        Map<Long, Photo> entries = new HashMap<>();
        for (Photo photo : photos) {
            if (photo == null || photo.spotId() == null || photo.spotId() <= 0
                    || isBlank(photo.title()) || isBlank(photo.address()) || isBlank(photo.url())
                    || photo.latitude() == null || photo.longitude() == null
                    || entries.putIfAbsent(photo.spotId(), photo) != null) {
                throw new IllegalArgumentException("Verified spot photos require unique IDs and complete place identities.");
            }
        }
        photosBySpotId = Map.copyOf(entries);
    }

    /** 원본 사진이 있거나 식별정보가 달라지면 검수사진을 적용하지 않는다. */
    public String thumbnailFor(Long spotId, String title, String address,
                               BigDecimal latitude, BigDecimal longitude, String sourceThumbnail) {
        if (!isBlank(sourceThumbnail) || spotId == null) {
            return sourceThumbnail;
        }
        Photo photo = photosBySpotId.get(spotId);
        if (photo == null || !photo.title().equals(title) || !photo.address().equals(address)
                || !sameCoordinate(photo.latitude(), latitude) || !sameCoordinate(photo.longitude(), longitude)) {
            return sourceThumbnail;
        }
        return photo.url();
    }

    private static boolean sameCoordinate(BigDecimal expected, BigDecimal actual) {
        return actual != null && expected.compareTo(actual) == 0;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static List<Photo> readCatalog(ObjectMapper objectMapper, Resource resource) {
        try (InputStream input = resource.getInputStream()) {
            Catalog catalog = objectMapper.readValue(input, Catalog.class);
            if (catalog == null || catalog.version() != 1) {
                throw new IllegalStateException("Verified spot photo catalog must have version 1.");
            }
            return catalog.images();
        } catch (IOException e) {
            throw new IllegalStateException("Unable to load required verified spot photo catalog: " + CATALOG_RESOURCE, e);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Catalog(int version, List<Photo> images) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Photo(Long spotId, String title, String address,
                        BigDecimal latitude, BigDecimal longitude, String url) { }
}
