package taedonghee.plan_fix.application.spot;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.RecommendedSpotRepository;
import taedonghee.plan_fix.domain.spot.SpotLikeRepository;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/** 선정된 강원 대표 장소 중 현재 공개된 장소를 중복 없이 무작위로 보여준다. */
@Service
@Transactional(readOnly = true)
public class RecommendedSpotApplicationService {

    private final RecommendedSpotRepository repository;
    private final RecommendedSpotCatalog catalog;
    private final SpotLikeRepository likes;
    private final SpotThumbnailResolver thumbnails;
    private final Random random;

    @Autowired
    public RecommendedSpotApplicationService(RecommendedSpotRepository repository, RecommendedSpotCatalog catalog,
                                             SpotLikeRepository likes, SpotThumbnailResolver thumbnails) {
        this(repository, catalog, likes, thumbnails, new Random());
    }

    RecommendedSpotApplicationService(RecommendedSpotRepository repository, RecommendedSpotCatalog catalog,
                                      SpotLikeRepository likes, SpotThumbnailResolver thumbnails, Random random) {
        this.repository = repository;
        this.catalog = catalog;
        this.likes = likes;
        this.thumbnails = thumbnails;
        this.random = random;
    }

    public SpotListResult list(RecommendedSpotQuery query, Long viewerUserId) {
        if (query.size() < 1 || query.size() > 100) {
            throw new CoreException(ErrorType.BAD_REQUEST, "size는 1~100 사이여야 합니다.");
        }
        List<String> titles = catalog.titles(query.sigungu());
        if (!RecommendedSpotCatalog.REGION.equals(query.region()) || titles.isEmpty()) {
            return new SpotListResult(List.of(), 0, query.size(), 0);
        }

        Set<RecommendedSpotCatalog.Place> seenPlaces = new HashSet<>();
        Set<Long> seenIds = new HashSet<>();
        List<SpotModel> candidates = new ArrayList<>(repository
                .findActiveCandidates(titles, query.region(), query.sigungu()).stream()
                .filter(spot -> spot.spotId() != null && spot.status() == SpotStatus.ACTIVE
                        && spot.sourceType() == SpotSourceType.TOUR_API && catalog.contains(spot))
                .filter(spot -> query.sigungu() == null || query.sigungu().equals(spot.sigungu()))
                // 동일 장소가 중복 수집되어도 항상 한 카드만 노출한다.
                .sorted(Comparator.comparing(SpotModel::spotId))
                .filter(spot -> seenPlaces.add(new RecommendedSpotCatalog.Place(spot.title(), spot.sigungu()))
                        && seenIds.add(spot.spotId()))
                .toList());
        int totalCount = candidates.size();
        Collections.shuffle(candidates, random);
        List<SpotModel> selected = candidates.subList(0, Math.min(query.size(), candidates.size()));

        Set<Long> likedIds = viewerUserId == null || selected.isEmpty() ? Set.of()
                : likes.findLikedSpotIds(viewerUserId, selected.stream().map(SpotModel::spotId).toList());
        Map<Long, String> selectedThumbnails = thumbnails.resolve(selected);
        List<SpotListResult.Item> items = selected.stream()
                .map(spot -> SpotListResult.Item.from(spot, likedIds.contains(spot.spotId()),
                        selectedThumbnails.get(spot.spotId())))
                .toList();
        return new SpotListResult(items, 0, query.size(), totalCount);
    }
}
