package taedonghee.plan_fix.application.course;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import taedonghee.plan_fix.domain.course.CourseModel;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.spot.SpotModel;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.SplittableRandom;
import java.util.stream.Collectors;

/** 공개 코스 카드에만 쓰는 대표 사진을 고른다. 코스에 저장된 thumbnail은 변경하지 않는다. */
@Component
public class CourseCoverImageSelector {

    private static final String CATALOG_RESOURCE = "course-cover-images.json";
    private static final Set<String> REGION_KEYWORDS = Set.of(
            "강원", "강원도", "강원특별자치도", "춘천", "춘천시", "원주", "원주시", "강릉", "강릉시",
            "동해", "동해시", "태백", "태백시", "속초", "속초시", "삼척", "삼척시", "홍천", "홍천군",
            "횡성", "횡성군", "영월", "영월군", "평창", "평창군", "정선", "정선군", "철원", "철원군",
            "화천", "화천군", "양구", "양구군", "인제", "인제군", "고성", "고성군", "양양", "양양군"
    );
    private static final Set<String> GENERAL_KEYWORDS = Set.of(
            "여행", "관광", "관광지", "자연", "풍경", "바다", "해변", "해안", "해수욕장", "모래", "파도", "바위", "초원", "호수", "강변",
            "계곡", "폭포", "산림", "수목원", "숲", "산", "강", "물", "겨울", "봄", "여름", "가을",
            "사계절", "눈", "단풍", "산책", "등산", "트레킹", "해돋이", "일출", "일몰"
    );
    private static final Comparator<MatchScore> MATCH_ORDER = Comparator.comparingInt(MatchScore::specific)
            .thenComparingInt(MatchScore::general).thenComparingInt(MatchScore::theme);
    private static final Map<String, List<String>> THEME_KEYWORDS = Map.ofEntries(
            Map.entry("coast", List.of("바다", "해변", "해수욕", "해안", "항구", "등대", "일출", "일몰", "방파제", "파도")),
            Map.entry("mountain", List.of("설악", "오대산", "태백산", "치악", "발왕", "산행", "등산", "능선", "고개", "정상")),
            Map.entry("forest", List.of("숲", "산림", "수목원", "자작나무", "단풍", "휴양림")),
            Map.entry("lake", List.of("호수", "호반", "경포호", "의암호", "소양호", "춘천호", "청초호", "영랑호")),
            Map.entry("river", List.of("강변", "계곡", "폭포", "하천", "래프팅", "동강", "내린천")),
            Map.entry("city", List.of("도시", "시내", "거리", "야경", "도심")),
            Map.entry("culture", List.of("문화", "박물관", "미술관", "사찰", "역사", "유적", "전통", "한옥")),
            Map.entry("food", List.of("음식점", "맛집", "시장", "식사", "먹거리", "미식")),
            Map.entry("cafe", List.of("카페", "커피", "찻집", "음료", "디저트")),
            Map.entry("activity", List.of("레포츠", "액티비티", "서핑", "스키", "레일바이크", "자전거", "패러글라이딩", "래프팅", "카누", "카약", "캠핑")),
            Map.entry("accommodation", List.of("숙소", "숙박", "호텔", "리조트", "펜션", "게스트하우스", "호캉스", "글램핑")),
            Map.entry("winter", List.of("겨울", "설경", "눈꽃", "설원", "눈길", "스키", "스노보드", "눈썰매"))
    );

    private final List<Image> images;

    @Autowired
    public CourseCoverImageSelector(ObjectMapper objectMapper) {
        this(objectMapper, new ClassPathResource(CATALOG_RESOURCE));
    }

    CourseCoverImageSelector(ObjectMapper objectMapper, Resource resource) {
        this(readCatalog(objectMapper, resource));
    }

    /** 작은 카탈로그를 주입하여 DB나 S3 없이 선택 규칙을 검증할 수 있다. */
    public CourseCoverImageSelector(List<Image> images) {
        if (images == null || images.isEmpty()) {
            throw new IllegalArgumentException("Course cover image catalog must not be empty.");
        }
        Set<String> ids = new HashSet<>();
        for (Image image : images) {
            if (image == null || image.id() == null || image.id().isBlank() || !ids.add(image.id())) {
                throw new IllegalArgumentException("Course cover image catalog requires unique, nonempty image ids.");
            }
            URI uri;
            try {
                uri = URI.create(Objects.requireNonNull(image.url()));
            } catch (IllegalArgumentException | NullPointerException e) {
                throw new IllegalArgumentException("Course cover image catalog requires valid HTTPS image URLs.", e);
            }
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null) {
                throw new IllegalArgumentException("Course cover image catalog requires valid HTTPS image URLs.");
            }
            if (image.regions().stream().anyMatch(region -> !region.matches("[0-9]{3}"))) {
                throw new IllegalArgumentException("Course cover image regions must be three-digit legal district codes.");
            }
        }
        // JSON 정렬이나 공개 목록 정렬이 달라져도 같은 코스의 선택 결과는 같다.
        this.images = images.stream().sorted(Comparator.comparing(Image::id)).toList();
    }

    public String select(CourseModel course, Map<Long, SpotModel> spotsById) {
        return select(course, spotsById, Map.of());
    }

    public String select(CourseModel course, Map<Long, SpotModel> spotsById, Map<Long, String> spotThumbnails) {
        if (course.thumbnail() != null && !course.thumbnail().isBlank()) {
            return course.thumbnail();
        }

        List<String> spotImages = courseSpotImages(course, spotsById, spotThumbnails);
        if (!spotImages.isEmpty()) {
            return spotImages.get(new SplittableRandom(course.courseId()).nextInt(spotImages.size()));
        }

        CandidatePool pool = candidates(course, spotsById);
        List<Image> candidates = pool.images();
        MatchScore bestScore = pool.scores().values().stream().max(MATCH_ORDER).orElseThrow();
        if (bestScore.hasMatch()) {
            candidates = candidates.stream().filter(image -> pool.scores().get(image).equals(bestScore)).toList();
        } else if (!pool.regional().isEmpty()) {
            candidates = pool.regional();
        }

        long seed = Objects.requireNonNull(course.courseId(), "A saved course id is required to select its cover.");
        return candidates.get(new SplittableRandom(seed).nextInt(candidates.size())).url();
    }

    /**
     * 같은 목록 안에서 관련 후보로 만들 수 있는 고유 이미지 수를 최대화한다.
     * 같은 코스 집합은 입력/카탈로그 순서나 재조회와 무관하게 동일하게 배분한다.
     * 페이지 크기/구성이 달라지면 배분은 달라질 수 있으며 DB thumbnail은 변경하지 않는다.
     */
    public Map<Long, String> selectForCourses(List<CourseModel> courses, Map<Long, SpotModel> spotsById) {
        return selectForCourses(courses, spotsById, Map.of());
    }

    public Map<Long, String> selectForCourses(List<CourseModel> courses, Map<Long, SpotModel> spotsById,
                                             Map<Long, String> spotThumbnails) {
        Map<Long, String> selected = new HashMap<>();
        Map<String, Integer> usage = new HashMap<>();
        Map<Long, List<String>> choices = new HashMap<>();
        Map<Long, Map<String, String>> candidateUrls = new HashMap<>();
        for (CourseModel course : courses) {
            if (course.thumbnail() != null && !course.thumbnail().isBlank()) {
                selected.put(course.courseId(), course.thumbnail());
                usage.merge(imageIdentity(course.thumbnail()), 1, Integer::sum);
            } else {
                Map<String, String> urls = new LinkedHashMap<>();
                for (String url : rankedCandidates(course, spotsById, spotThumbnails)) {
                    urls.putIfAbsent(imageIdentity(url), url);
                }
                candidateUrls.put(course.courseId(), urls);
                choices.put(course.courseId(), List.copyOf(urls.keySet()));
            }
        }
        Set<String> reserved = Set.copyOf(usage.keySet());
        List<Long> order = choices.keySet().stream()
                .sorted(Comparator.<Long>comparingInt(id -> choices.get(id).size()).thenComparingLong(id -> id))
                .toList();
        Map<String, Long> owners = new HashMap<>();
        for (Long courseId : order) {
            assignUnique(courseId, choices, owners, reserved, new HashSet<>());
        }
        owners.forEach((url, courseId) -> {
            selected.put(courseId, candidateUrls.get(courseId).get(url));
            usage.merge(url, 1, Integer::sum);
        });
        // 후보가 부족할 때만 재사용하며, 사용 횟수가 같으면 관련도와 고정 시드 순서를 따른다.
        for (Long courseId : order) {
            if (selected.containsKey(courseId)) continue;
            String image = choices.get(courseId).stream()
                    .min(Comparator.comparingInt(candidate -> usage.getOrDefault(candidate, 0)))
                    .orElseThrow();
            selected.put(courseId, candidateUrls.get(courseId).get(image));
            usage.merge(image, 1, Integer::sum);
        }
        return Map.copyOf(selected);
    }

    /** 표시 URL은 보존하고, 사진 자체와 관계없는 fragment/쿼리 순서만 중복 판정에서 제외한다. */
    private static String imageIdentity(String url) {
        String normalized = url.strip().split("#", 2)[0];
        int queryStart = normalized.indexOf('?');
        if (queryStart < 0) return normalized;
        String query = Arrays.stream(normalized.substring(queryStart + 1).split("&", -1))
                .sorted(Comparator.comparing(parameter -> parameter.split("=", 2)[0]))
                .collect(Collectors.joining("&"));
        return normalized.substring(0, queryStart + 1) + query;
    }

    private List<String> rankedCandidates(CourseModel course, Map<Long, SpotModel> spotsById,
                                          Map<Long, String> spotThumbnails) {
        List<String> spotImages = courseSpotImages(course, spotsById, spotThumbnails);
        if (!spotImages.isEmpty()) {
            SplittableRandom random = new SplittableRandom(course.courseId());
            Map<String, Long> tieBreaks = new HashMap<>();
            for (String image : spotImages) tieBreaks.put(image, random.nextLong());
            return spotImages.stream().sorted(Comparator.comparingLong(tieBreaks::get)).toList();
        }

        CandidatePool pool = candidates(course, spotsById);
        List<Image> eligible = pool.images().stream()
                .filter(image -> pool.regional().contains(image) || pool.scores().get(image).hasMatch())
                .toList();
        if (eligible.isEmpty()) eligible = pool.images();
        // 최고 점수 한 장으로 좁히지 않고, 같은 지역/관련 테마의 차선 후보도 남긴다.
        SplittableRandom random = new SplittableRandom(course.courseId());
        Map<String, Long> tieBreaks = new HashMap<>();
        for (Image image : eligible) tieBreaks.put(image.id(), random.nextLong());
        return eligible.stream().sorted(Comparator
                .<Image, MatchScore>comparing(image -> pool.scores().get(image), MATCH_ORDER).reversed()
                .thenComparingLong(image -> tieBreaks.get(image.id()))
                .thenComparing(Image::id)).map(Image::url).distinct().toList();
    }

    /** 업로드가 없으면 코스에 포함된 장소의 대표/상세 사진만 후보로 쓰고, 모두 없을 때만 카탈로그를 쓴다. */
    private static List<String> courseSpotImages(CourseModel course, Map<Long, SpotModel> spotsById,
                                                 Map<Long, String> spotThumbnails) {
        return course.days().stream()
                .flatMap(day -> day.spots().stream())
                .map(CourseSpotModel::spotId)
                .distinct()
                .map(spotId -> {
                    String resolved = spotThumbnails.get(spotId);
                    if (resolved != null && !resolved.isBlank()) return resolved;
                    SpotModel spot = spotsById.get(spotId);
                    return spot == null ? null : spot.thumbnail();
                })
                .filter(Objects::nonNull)
                .map(String::strip)
                .filter(image -> !image.isEmpty())
                .distinct()
                .sorted()
                .toList();
    }

    /** 증가 경로를 찾아 이미 배정된 코스를 다른 후보로 옮기므로 단순 선착순 중복을 피한다. */
    private static boolean assignUnique(Long courseId, Map<Long, List<String>> choices,
                                        Map<String, Long> owners, Set<String> reserved, Set<String> visited) {
        // 기존 배정을 움직이기 전에 아직 사용되지 않은 관련 후보부터 찾는다.
        for (String url : choices.get(courseId)) {
            if (!reserved.contains(url) && !visited.contains(url) && !owners.containsKey(url)) {
                owners.put(url, courseId);
                return true;
            }
        }
        for (String url : choices.get(courseId)) {
            if (reserved.contains(url) || !visited.add(url)) continue;
            Long previous = owners.get(url);
            if (previous != null && assignUnique(previous, choices, owners, reserved, visited)) {
                owners.put(url, courseId);
                return true;
            }
        }
        return false;
    }

    private CandidatePool candidates(CourseModel course, Map<Long, SpotModel> spotsById) {
        List<SpotModel> spots = course.days().stream()
                .flatMap(day -> day.spots().stream())
                .map(CourseSpotModel::spotId)
                .distinct()
                .map(spotsById::get)
                .filter(Objects::nonNull)
                .toList();
        Set<String> regions = spots.stream()
                .filter(spot -> "51".equals(spot.region()))
                .map(SpotModel::sigungu)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());

        List<Image> regional = images.stream()
                .filter(image -> image.regions().stream().anyMatch(regions::contains))
                .toList();
        // 지역을 특정하지 않는 테마 사진(객실·커피 등)은 내용이 일치할 때만 후보에 포함한다.
        List<Image> candidates = regional.isEmpty() ? images : images.stream()
                .filter(image -> image.regions().isEmpty() || regional.contains(image)).toList();

        StringBuilder text = new StringBuilder();
        appendText(text, course.title(), course.description());
        for (SpotModel spot : spots) {
            appendText(text, spot.title(), spot.category(), spot.description());
        }
        String normalizedText = text.toString().toLowerCase(Locale.ROOT);
        Map<Image, MatchScore> scores = candidates.stream()
                .collect(Collectors.toMap(image -> image, image -> scoreText(image, normalizedText)));
        return new CandidatePool(candidates, regional, scores);
    }

    private record CandidatePool(List<Image> images, List<Image> regional, Map<Image, MatchScore> scores) { }

    private static MatchScore scoreText(Image image, String text) {
        List<String> matched = image.keywords().stream()
                // '양'이 '양양'에, '산'이 '산책'에 반응하는 식의 한 글자 우연 일치를 피한다.
                .filter(keyword -> keyword.length() > 1 && !REGION_KEYWORDS.contains(keyword))
                .filter(text::contains).toList();
        List<String> distinctMatches = matched.stream()
                // '경포해변'에 포함된 '경포'/'해변'을 별도 근거로 중복 계산하지 않는다.
                .filter(keyword -> matched.stream().noneMatch(other -> other.length() > keyword.length() && other.contains(keyword)))
                .toList();
        int specific = (int) distinctMatches.stream().filter(keyword -> !GENERAL_KEYWORDS.contains(keyword)).count();
        int general = distinctMatches.size() - specific;
        boolean themeMatch = image.themes().stream().filter(theme -> !"general".equals(theme))
                .anyMatch(theme -> text.contains(theme)
                        || THEME_KEYWORDS.getOrDefault(theme, List.of()).stream().anyMatch(text::contains));
        return new MatchScore(specific, general, themeMatch ? 1 : 0);
    }

    /** 구체 키워드 > 사진에 직접 붙은 일반 키워드 > 넓은 테마 순으로 비교한다. */
    private record MatchScore(int specific, int general, int theme) {
        boolean hasMatch() { return specific > 0 || general > 0 || theme > 0; }
    }

    private static void appendText(StringBuilder target, String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) target.append(value).append('\n');
        }
    }

    private static List<Image> readCatalog(ObjectMapper objectMapper, Resource resource) {
        try (InputStream input = resource.getInputStream()) {
            Catalog catalog = objectMapper.readValue(input, Catalog.class);
            if (catalog == null || catalog.version() != 1 || catalog.images() == null
                    || catalog.images().isEmpty() || catalog.images().size() > 40) {
                throw new IllegalStateException("Required course-cover-images.json must have version 1 and 1 to 40 images.");
            }
            return catalog.images();
        } catch (IOException e) {
            throw new IllegalStateException("Unable to load required course cover image catalog: " + CATALOG_RESOURCE, e);
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Catalog(int version, List<Image> images) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Image(String id, String url, List<String> regions, List<String> themes, List<String> keywords) {
        public Image {
            regions = normalizedTerms(regions);
            themes = normalizedTerms(themes);
            keywords = normalizedTerms(keywords);
        }

        private static List<String> normalizedTerms(List<String> values) {
            if (values == null) return List.of();
            return values.stream().filter(Objects::nonNull).map(String::strip)
                    .map(value -> value.toLowerCase(Locale.ROOT)).filter(value -> !value.isEmpty()).distinct().toList();
        }
    }
}
