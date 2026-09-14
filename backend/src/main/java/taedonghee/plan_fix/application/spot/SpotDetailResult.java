package taedonghee.plan_fix.application.spot;

import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.TourDataInfoModel;

import java.math.BigDecimal;
import java.util.List;

/**
 * [application] 스팟 상세 조회 결과. 공개 상세라 서비스 소유 필드 중 status/source는 담지 않는다.
 *
 * images/info는 TourAPI로 수집된 스팟일 때만 채워진다. 원본(NATIVE 등)이거나 아직
 * detailIntro2/detailImage2를 수집하지 않은 TourAPI 스팟이면 각각 빈 리스트/null이다.
 *
 * isLiked는 조회한 사람(viewerUserId) 기준이다. 비로그인이면 항상 false다.
 */
public record SpotDetailResult(
        Long spotId,
        String title,
        String category,
        String region,
        String sigungu,
        String address,
        BigDecimal latitude,
        BigDecimal longitude,
        String thumbnail,
        String description,
        long viewCount,
        long likeCount,
        long commentCount,
        List<String> images,
        TourInfo info,
        boolean isLiked
) {

    /**
     * viewCount를 별도로 받는 이유: 조회 시점에 저장소의 view_count를 +1 시키지만,
     * 그 갱신된 값을 다시 읽어오지 않고 이미 들고 있는 spot에 +1 한 값을 그대로 응답에 반영하기 위함이다.
     */
    public static SpotDetailResult of(
            SpotModel spot, long viewCount, List<String> images, TourInfo info, boolean isLiked) {
        return new SpotDetailResult(
                spot.spotId(),
                spot.title(),
                spot.category(),
                spot.region(),
                spot.sigungu(),
                spot.address(),
                spot.latitude(),
                spot.longitude(),
                SpotThumbnailResolver.select(spot.thumbnail(), images),
                spot.description(),
                viewCount,
                spot.likeCount(),
                spot.commentCount(),
                images,
                info,
                isLiked
        );
    }

    /**
     * detailIntro2 결과. contentTypeId마다 실제 값이 들어오는 필드가 달라
     * (예: firstMenu/treatMenu/lcnsno는 음식점만) 값이 없는 필드는 null로 내려간다.
     */
    public record TourInfo(
            String tel,
            String parkInfo,
            String timeInfo,
            String restInfo,
            String firstMenu,
            String treatMenu,
            String lcnsno
    ) {

        public static TourInfo from(TourDataInfoModel info) {
            return new TourInfo(
                    info.tel(),
                    info.parkInfo(),
                    info.timeInfo(),
                    info.restInfo(),
                    info.firstMenu(),
                    info.treatMenu(),
                    info.lcnsno()
            );
        }
    }
}
