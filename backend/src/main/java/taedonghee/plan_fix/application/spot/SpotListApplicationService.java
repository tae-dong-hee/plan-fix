package taedonghee.plan_fix.application.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSearchCondition;
import taedonghee.plan_fix.domain.spot.SpotSortType;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;

/**
 * [application] 공개 스팟 목록 조회.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SpotListApplicationService {

    private static final int MAX_SIZE = 100;

    private final SpotRepository spotRepository;
    private final taedonghee.plan_fix.domain.spot.SpotLikeRepository spotLikeRepository;
    private final SpotThumbnailResolver thumbnailResolver;

    public SpotListResult list(SpotListQuery query) {
        return list(query, null);
    }

    public SpotListResult list(SpotListQuery query, Long viewerUserId) {
        validate(query);
        SpotSearchCondition condition = new SpotSearchCondition(query.keyword(), query.category(), query.region(), query.sigungu());
        SpotSortType sort = parseSort(query.sort());

        List<SpotModel> spots = spotRepository.searchActive(condition, sort, query.offset(), query.size());
        long totalCount = spotRepository.countActive(condition);

        java.util.Set<Long> likedSpotIds = java.util.Set.of();
        if (viewerUserId != null && !spots.isEmpty()) {
            List<Long> spotIds = spots.stream().map(SpotModel::spotId).toList();
            likedSpotIds = spotLikeRepository.findLikedSpotIds(viewerUserId, spotIds);
        }

        final java.util.Set<Long> finalLikedSpotIds = likedSpotIds;
        java.util.Map<Long, String> thumbnails = thumbnailResolver.resolve(spots);
        List<SpotListResult.Item> items = spots.stream()
                .map(spot -> SpotListResult.Item.from(spot, finalLikedSpotIds.contains(spot.spotId()),
                        thumbnails.get(spot.spotId())))
                .toList();

        return new SpotListResult(items, query.offset(), query.size(), totalCount);
    }

    private void validate(SpotListQuery query) {
        if (query.offset() < 0) {
            throw new CoreException(ErrorType.BAD_REQUEST, "offset은 0 이상이어야 합니다.");
        }
        if (query.size() < 1 || query.size() > MAX_SIZE) {
            throw new CoreException(ErrorType.BAD_REQUEST, "size는 1~" + MAX_SIZE + " 사이여야 합니다.");
        }
    }

    private SpotSortType parseSort(String sort) {
        if (sort == null) {
            return SpotSortType.LATEST;
        }
        return switch (sort) {
            case "latest" -> SpotSortType.LATEST;
            case "popular" -> SpotSortType.POPULAR;
            default -> throw new CoreException(ErrorType.BAD_REQUEST, "sort는 latest 또는 popular만 가능합니다. sort=" + sort);
        };
    }
}
