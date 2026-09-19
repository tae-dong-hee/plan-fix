package taedonghee.plan_fix.interfaces.api.spot;

import taedonghee.plan_fix.application.spot.SpotDetailResult;

import java.math.BigDecimal;
import java.util.List;

/**
 * [interfaces] 공개 스팟 상세 조회 응답 DTO.
 * images/info는 TourAPI로 수집된 스팟일 때만 채워지고, 그 외에는 각각 빈 리스트/null이다.
 * isLiked는 요청한 사람(비로그인이면 false) 기준이다.
 */
public record SpotDetailResponse(
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

    public static SpotDetailResponse from(SpotDetailResult result) {
        return new SpotDetailResponse(
                result.spotId(),
                result.title(),
                result.category(),
                result.region(),
                result.sigungu(),
                result.address(),
                result.latitude(),
                result.longitude(),
                result.thumbnail(),
                result.description(),
                result.viewCount(),
                result.likeCount(),
                result.commentCount(),
                result.images(),
                result.info() == null ? null : TourInfo.from(result.info()),
                result.isLiked()
        );
    }

    /** detailIntro2/detailInfo2 결과. additionalInfo는 정상 빈 결과일 때 빈 문자열이다. */
    public record TourInfo(
            String tel,
            String parkInfo,
            String timeInfo,
            String restInfo,
            String firstMenu,
            String treatMenu,
            String lcnsno,
            String additionalInfo
    ) {

        public static TourInfo from(SpotDetailResult.TourInfo info) {
            return new TourInfo(
                    info.tel(),
                    info.parkInfo(),
                    info.timeInfo(),
                    info.restInfo(),
                    info.firstMenu(),
                    info.treatMenu(),
                    info.lcnsno(),
                    info.additionalInfo()
            );
        }
    }
}
