package taedonghee.plan_fix.application.wishlist;

import taedonghee.plan_fix.domain.spot.SpotModel;

import java.math.BigDecimal;

/** 위시리스트의 장소 요약. 표시용 사진은 원본 장소를 수정하지 않고 별도로 전달한다. */
public record WishlistSpotResult(
        Long spotId,
        String title,
        String category,
        String region,
        String sigungu,
        String address,
        BigDecimal latitude,
        BigDecimal longitude,
        String thumbnail,
        long likeCount,
        boolean isLiked
) {
    public static WishlistSpotResult from(SpotModel spot, String thumbnail) {
        return new WishlistSpotResult(spot.spotId(), spot.title(), spot.category(), spot.region(), spot.sigungu(),
                spot.address(), spot.latitude(), spot.longitude(), thumbnail, spot.likeCount(), true);
    }
}
