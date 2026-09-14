package taedonghee.plan_fix.application.wishlist;

import taedonghee.plan_fix.domain.spot.SpotModel;

/** 위시리스트의 장소 요약. 표시용 사진은 원본 장소를 수정하지 않고 별도로 전달한다. */
public record WishlistSpotResult(
        Long spotId,
        String title,
        String category,
        String region,
        String sigungu,
        String address,
        String thumbnail,
        long likeCount,
        boolean isLiked
) {
    public static WishlistSpotResult from(SpotModel spot, String thumbnail) {
        return new WishlistSpotResult(spot.spotId(), spot.title(), spot.category(), spot.region(), spot.sigungu(),
                spot.address(), thumbnail, spot.likeCount(), true);
    }
}
