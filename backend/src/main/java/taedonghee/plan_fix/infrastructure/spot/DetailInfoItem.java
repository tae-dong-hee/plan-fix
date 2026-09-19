package taedonghee.plan_fix.infrastructure.spot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** detailInfo2의 일반 반복정보. 숙박(32)/여행코스(25)는 별도 구조이므로 수집 대상에서 제외한다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DetailInfoItem(String contentid, String contenttypeid, String infoname, String infotext) {
}
