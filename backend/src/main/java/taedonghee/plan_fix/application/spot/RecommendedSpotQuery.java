package taedonghee.plan_fix.application.spot;

/** 메인 추천 목록은 매 요청마다 새로 뽑으며 페이지 offset을 받지 않는다. */
public record RecommendedSpotQuery(String region, String sigungu, int size) {

    public RecommendedSpotQuery {
        region = region == null || region.isBlank() ? "51" : region.strip();
        sigungu = sigungu == null || sigungu.isBlank() ? null : sigungu.strip();
    }
}
