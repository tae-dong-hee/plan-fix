package taedonghee.plan_fix.infrastructure.spot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** TourAPI detailCommon2의 장소 소개. 필드명은 원본 응답과 동일하다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DetailCommonItem(String contentid, String contenttypeid, String overview) {
}
