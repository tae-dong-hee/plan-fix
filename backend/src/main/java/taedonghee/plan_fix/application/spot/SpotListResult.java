package taedonghee.plan_fix.application.spot;

import taedonghee.plan_fix.domain.spot.SpotModel;

import java.math.BigDecimal;
import java.util.List;

/**
 * [application] 공개 스팟 목록 조회 결과.
 */
public record SpotListResult(List<Item> items, int offset, int size, long totalCount) {

    /**
     * 목록에 노출할 스팟 요약. 공개 목록이라 좋아요 수 등 서비스 소유 필드는 담지 않는다.
     * 좌표는 목록을 지도에 표시하기 위해 함께 내려준다(수집 데이터에 좌표가 없으면 null).
     */
    public record Item(Long spotId, String title, String category, String region, String sigungu, String thumbnail,
                       BigDecimal latitude, BigDecimal longitude, boolean isLiked) {

        public static Item from(SpotModel spot) {
            return from(spot, false);
        }

        public static Item from(SpotModel spot, boolean isLiked) {
            return from(spot, isLiked, spot.thumbnail());
        }

        public static Item from(SpotModel spot, boolean isLiked, String thumbnail) {
            return new Item(spot.spotId(), spot.title(), spot.category(), spot.region(), spot.sigungu(),
                    thumbnail, spot.latitude(), spot.longitude(), isLiked);
        }
    }
}
