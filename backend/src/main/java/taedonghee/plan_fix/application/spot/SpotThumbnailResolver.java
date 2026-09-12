package taedonghee.plan_fix.application.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;

import java.net.URI;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/** 응답 사진 선택: 대표사진 → 저장된 상세사진 → null(프론트 기본 이미지). */
@Service
@RequiredArgsConstructor
public class SpotThumbnailResolver {

    private final TourDataImageRepository images;

    public Map<Long, String> resolve(Collection<SpotModel> spots) {
        Map<Long, String> thumbnails = new HashMap<>();
        Set<Long> missingSpotIds = new LinkedHashSet<>();
        for (SpotModel spot : spots) {
            if (spot.thumbnail() != null && !spot.thumbnail().isBlank()) {
                thumbnails.put(spot.spotId(), spot.thumbnail());
            } else if (spot.sourceType() == SpotSourceType.TOUR_API) {
                missingSpotIds.add(spot.spotId());
            }
        }

        // 페이지의 사진 누락 장소만 일괄 조회하며 외부 API는 호출하지 않는다.
        if (!missingSpotIds.isEmpty()) {
            for (SpotImageCandidate candidate : images.findBySpotIds(missingSpotIds)) {
                String url = select(null, Arrays.asList(candidate.originalImage(), candidate.smallImage()));
                if (url != null) {
                    thumbnails.putIfAbsent(candidate.spotId(), url);
                }
            }
        }
        return thumbnails;
    }

    /** 상세 화면에서는 이미 조회한 사진 목록을 재사용한다. */
    public static String select(String thumbnail, Collection<String> detailImages) {
        if (thumbnail != null && !thumbnail.isBlank()) {
            return thumbnail;
        }
        for (String image : detailImages) {
            if (image == null || image.isBlank()) {
                continue;
            }
            String url = image.strip();
            try {
                URI uri = URI.create(url);
                if (("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                        && uri.getHost() != null) {
                    return url;
                }
            } catch (IllegalArgumentException ignored) {
                // 잘못 저장된 경로는 건너뛰고 다음 사진을 확인한다.
            }
        }
        return null;
    }
}
