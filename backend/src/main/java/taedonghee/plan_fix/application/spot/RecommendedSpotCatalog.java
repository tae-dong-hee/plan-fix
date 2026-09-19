package taedonghee.plan_fix.application.spot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import taedonghee.plan_fix.domain.spot.SpotModel;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 환경마다 달라지는 DB ID 대신 정확한 장소명과 법정 시군구 코드로 관리한다. */
@Component
public class RecommendedSpotCatalog {

    public static final String REGION = "51";
    private static final String CATALOG_RESOURCE = "recommended-gangwon-spots.json";

    private final List<Place> places;
    private final Set<Place> approved;

    @Autowired
    public RecommendedSpotCatalog(ObjectMapper objectMapper) {
        this(objectMapper, new ClassPathResource(CATALOG_RESOURCE));
    }

    RecommendedSpotCatalog(ObjectMapper objectMapper, Resource resource) {
        this(readCatalog(objectMapper, resource));
    }

    RecommendedSpotCatalog(List<Place> places) {
        if (places == null || places.isEmpty() || places.size() > 100) {
            throw new IllegalArgumentException("Recommended spot catalog requires 1 to 100 places.");
        }
        Set<Place> unique = new HashSet<>();
        for (Place place : places) {
            if (place == null || place.title() == null || place.title().isBlank()
                    || !place.title().equals(place.title().strip())
                    || place.sigungu() == null || !place.sigungu().matches("[0-9]{3}")
                    || !unique.add(place)) {
                throw new IllegalArgumentException("Recommended spots require unique titles and three-digit district codes.");
            }
        }
        this.places = List.copyOf(places);
        this.approved = Set.copyOf(unique);
    }

    public List<String> titles(String sigungu) {
        return places.stream()
                .filter(place -> sigungu == null || sigungu.equals(place.sigungu()))
                .map(Place::title).distinct().toList();
    }

    public boolean contains(SpotModel spot) {
        return REGION.equals(spot.region()) && approved.contains(new Place(spot.title(), spot.sigungu()));
    }

    private static List<Place> readCatalog(ObjectMapper objectMapper, Resource resource) {
        try (InputStream input = resource.getInputStream()) {
            Catalog catalog = objectMapper.readValue(input, Catalog.class);
            if (catalog == null || catalog.version() != 1) {
                throw new IllegalStateException("Recommended spot catalog must have version 1.");
            }
            return catalog.places();
        } catch (IOException e) {
            throw new IllegalStateException("Unable to load required recommended spot catalog: " + CATALOG_RESOURCE, e);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Catalog(int version, List<Place> places) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Place(String title, String sigungu) { }
}
