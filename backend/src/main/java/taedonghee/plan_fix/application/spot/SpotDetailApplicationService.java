package taedonghee.plan_fix.application.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotLikeRepository;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;
import taedonghee.plan_fix.domain.spot.TourDataInfoRepository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;
import java.util.Arrays;
import java.util.Objects;
import java.util.Optional;

/**
 * [application] 공개 스팟 상세 조회. 조회할 때마다 view_count를 1 늘린다.
 *
 * sourceType이 TOUR_API인 스팟은 tour_data_spots를 역참조해 tour_data_info(부가 정보)와
 * tour_data_images(사진)를 함께 붙여 응답한다. 아직 그 단계까지 수집되지 않았거나
 * TourAPI 소스가 아니면 images는 빈 리스트, info는 null로 내려간다 — 에러가 아니다.
 *
 * viewerUserId는 조회하는 사람의 로그인 여부에 따라 null일 수 있다(비로그인).
 * null이면 isLiked는 항상 false다.
 */
@Service
@RequiredArgsConstructor
public class SpotDetailApplicationService {

    private final SpotRepository spotRepository;
    private final TourDataSpotRepository tourDataSpotRepository;
    private final TourDataInfoRepository tourDataInfoRepository;
    private final TourDataImageRepository tourDataImageRepository;
    private final SpotLikeRepository spotLikeRepository;

    @Transactional
    public SpotDetailResult get(Long spotId, Long viewerUserId) {
        SpotModel spot = spotRepository.findById(spotId)
                .filter(s -> s.status() == SpotStatus.ACTIVE)
                .orElseThrow(() -> new CoreException(ErrorType.NOT_FOUND, "spot not found. spotId=" + spotId));

        spotRepository.incrementViewCount(spotId);

        List<String> images = List.of();
        SpotDetailResult.TourInfo info = null;

        if (spot.sourceType() == SpotSourceType.TOUR_API) {
            Optional<TourDataSpotModel> tourDataSpot = tourDataSpotRepository.findBySpotId(spotId);
            if (tourDataSpot.isPresent()) {
                TourDataSpotModel source = tourDataSpot.get();
                images = tourDataImageRepository.findByTourDataSpotId(source.tourDataSpotId()).stream()
                        .map(image -> SpotThumbnailResolver.select(null,
                                Arrays.asList(image.originalImage(), image.smallImage())))
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList();
                info = tourDataInfoRepository.findByContentId(source.contentId())
                        .map(SpotDetailResult.TourInfo::from)
                        .orElse(null);
            }
        }

        boolean isLiked = viewerUserId != null && spotLikeRepository.existsByUserIdAndSpotId(viewerUserId, spotId);

        return SpotDetailResult.of(spot, spot.viewCount() + 1, images, info, isLiked);
    }
}
