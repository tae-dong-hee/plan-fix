package taedonghee.plan_fix.domain.spot;

/** 장소 응답에 사용할 수 있는 저장된 상세사진. 원본 대표사진을 변경하지 않는다. */
public record SpotImageCandidate(Long spotId, String originalImage, String smallImage) {
}
