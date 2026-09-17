package taedonghee.plan_fix.interfaces.api.route;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import taedonghee.plan_fix.infrastructure.route.KakaoRoadProperties;
import tools.jackson.databind.JsonNode;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 개인 숙소 주소를 지도 좌표로 바꾸는 최소 주소 검색 API. */
@RestController
@RequestMapping("/api/v1/locations")
public class LocationSearchController {

    private static final String KAKAO_API_HOST = "dapi.kakao.com";
    private static final String LODGING_CATEGORY = "AD5";
    private static final int SEARCH_RESULT_SIZE = 5;
    private static final int NEARBY_RADIUS_METERS = 3_000;

    private final KakaoRoadProperties properties;
    private final RestClient client;

    @Autowired
    public LocationSearchController(KakaoRoadProperties properties) {
        this.properties = properties;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(4));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    /** 주소 후보와 숙박(AD5) 장소를 함께 반환한다. */
    @PostMapping("/search")
    public ResponseEntity<List<Response>> search(@RequestBody Request request) {
        if (!isSearchable(request)) {
            return ResponseEntity.ok(List.of());
        }

        String query = request.address().strip();
        List<Response> addresses = searchAddresses(query);
        List<Response> places = searchLodgingsByKeyword(query);

        // 주소가 인식되면 그 지점 주변 숙소도 함께 추천한다.
        if (!addresses.isEmpty()) {
            Response center = addresses.getFirst();
            places.addAll(searchNearbyLodgings(center.longitude(), center.latitude()));
        }

        Map<String, Response> unique = new LinkedHashMap<>();
        addresses.forEach(item -> unique.put("ADDRESS|" + item.address(), item));
        places.forEach(item -> unique.putIfAbsent("PLACE|" + item.name() + "|" + item.address(), item));
        return ResponseEntity.ok(unique.values().stream().limit(12).toList());
    }

    /** 직접 등록 입력창에서 건물명 또는 주소로 위치 후보를 찾는다. */
    @PostMapping("/address-suggestions")
    public ResponseEntity<List<Response>> addressSuggestions(@RequestBody Request request) {
        if (!isSearchable(request)) {
            return ResponseEntity.ok(List.of());
        }

        String query = request.address().strip();
        Map<String, Response> unique = new LinkedHashMap<>();
        searchAddresses(query).forEach(item -> unique.put("ADDRESS|" + item.address(), item));
        searchPlacesByKeyword(query).forEach(item -> unique.putIfAbsent(
                "PLACE|" + item.name() + "|" + item.address(), item));
        return ResponseEntity.ok(unique.values().stream().limit(10).toList());
    }

    private List<Response> searchAddresses(String query) {
        try {
            JsonNode body = client.get()
                    .uri(uri -> uri.scheme("https")
                            .host(KAKAO_API_HOST)
                            .path("/v2/local/search/address.json")
                            .queryParam("query", query)
                            .queryParam("size", SEARCH_RESULT_SIZE)
                            .build())
                    .header("Authorization", authorizationHeader())
                    .retrieve()
                    .body(JsonNode.class);
            if (body == null) {
                return List.of();
            }

            List<Response> results = new ArrayList<>();
            for (JsonNode item : body.path("documents")) {
                if (!hasCoordinates(item)) {
                    continue;
                }
                String address = item.path("road_address").path("address_name").asText();
                if (address.isBlank()) {
                    address = item.path("address_name").asText();
                }
                results.add(toResponse("ADDRESS", "", address, item));
            }
            return results;
        } catch (RuntimeException ignored) {
            return List.of();
        }
    }

    private List<Response> searchLodgingsByKeyword(String query) {
        try {
            JsonNode body = client.get()
                    .uri(uri -> uri.scheme("https")
                            .host(KAKAO_API_HOST)
                            .path("/v2/local/search/keyword.json")
                            .queryParam("query", query)
                            .queryParam("category_group_code", LODGING_CATEGORY)
                            .queryParam("size", SEARCH_RESULT_SIZE)
                            .build())
                    .header("Authorization", authorizationHeader())
                    .retrieve()
                    .body(JsonNode.class);
            return lodgingResponses(body);
        } catch (RuntimeException ignored) {
            return new ArrayList<>();
        }
    }

    private List<Response> searchPlacesByKeyword(String query) {
        try {
            JsonNode body = client.get()
                    .uri(uri -> uri.scheme("https")
                            .host(KAKAO_API_HOST)
                            .path("/v2/local/search/keyword.json")
                            .queryParam("query", query)
                            .queryParam("size", SEARCH_RESULT_SIZE)
                            .build())
                    .header("Authorization", authorizationHeader())
                    .retrieve()
                    .body(JsonNode.class);
            List<Response> results = new ArrayList<>();
            if (body == null) {
                return results;
            }
            for (JsonNode item : body.path("documents")) {
                if (!hasCoordinates(item)) {
                    continue;
                }
                String address = item.path("road_address_name").asText();
                if (address.isBlank()) {
                    address = item.path("address_name").asText();
                }
                results.add(toResponse("PLACE", item.path("place_name").asText(), address, item));
            }
            return results;
        } catch (RuntimeException ignored) {
            return List.of();
        }
    }

    private List<Response> searchNearbyLodgings(double longitude, double latitude) {
        try {
            JsonNode body = client.get()
                    .uri(uri -> uri.scheme("https")
                            .host(KAKAO_API_HOST)
                            .path("/v2/local/search/category.json")
                            .queryParam("category_group_code", LODGING_CATEGORY)
                            .queryParam("x", longitude)
                            .queryParam("y", latitude)
                            .queryParam("radius", NEARBY_RADIUS_METERS)
                            .queryParam("sort", "distance")
                            .queryParam("size", SEARCH_RESULT_SIZE)
                            .build())
                    .header("Authorization", authorizationHeader())
                    .retrieve()
                    .body(JsonNode.class);
            return lodgingResponses(body);
        } catch (RuntimeException ignored) {
            return new ArrayList<>();
        }
    }

    private List<Response> lodgingResponses(JsonNode body) {
        List<Response> results = new ArrayList<>();
        if (body == null) {
            return results;
        }
        for (JsonNode item : body.path("documents")) {
            if (!hasCoordinates(item)) {
                continue;
            }
            String address = item.path("road_address_name").asText();
            if (address.isBlank()) {
                address = item.path("address_name").asText();
            }
            results.add(toResponse("PLACE", item.path("place_name").asText(), address, item));
        }
        return results;
    }

    private boolean hasCoordinates(JsonNode item) {
        return item.path("x").isTextual() && item.path("y").isTextual();
    }

    private Response toResponse(String type, String name, String address, JsonNode item) {
        return new Response(type, name, address, Double.parseDouble(item.path("y").asText()),
                Double.parseDouble(item.path("x").asText()));
    }

    @PostMapping("/geocode")
    public ResponseEntity<Response> geocode(@RequestBody Request request) {
        if (!isSearchable(request)) {
            return ResponseEntity.noContent().build();
        }

        try {
            JsonNode body = client.get()
                    .uri(uri -> uri.scheme("https")
                            .host(KAKAO_API_HOST)
                            .path("/v2/local/search/address.json")
                            .queryParam("query", request.address().strip())
                            .build())
                    .header("Authorization", authorizationHeader())
                    .retrieve()
                    .body(JsonNode.class);
            JsonNode document = body == null ? null : body.path("documents").path(0);
            if (document == null || !hasCoordinates(document)) {
                return ResponseEntity.noContent().build();
            }
            return ResponseEntity.ok(toResponse(
                    "ADDRESS",
                    "",
                    document.path("address_name").asText(),
                    document
            ));
        } catch (RuntimeException ignored) {
            return ResponseEntity.noContent().build();
        }
    }

    private boolean isSearchable(Request request) {
        return request != null
                && request.address() != null
                && !request.address().isBlank()
                && properties.apiKey() != null
                && !properties.apiKey().isBlank();
    }

    private String authorizationHeader() {
        return "KakaoAK " + properties.apiKey();
    }

    public record Request(String address) { }

    public record Response(String type, String name, String address, double latitude, double longitude) { }
}
