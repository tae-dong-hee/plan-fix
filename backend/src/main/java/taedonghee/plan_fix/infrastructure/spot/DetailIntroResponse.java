package taedonghee.plan_fix.infrastructure.spot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/**
 * [infrastructure] TourAPI detailIntro2 응답 전체를 그대로 매핑하는 DTO.
 *
 * areaBasedList2와 동일하게 response.header / response.body.items.item 구조이고,
 * 상세 정보가 없는 콘텐츠는 items가 빈 문자열("")로 오므로 firstItem()에서 방어적으로 처리한다.
 * ("" -> null 변환은 TourApiClient의 JsonMapper coercion 설정이 담당한다.)
 *
 * detailIntro2는 contentId 하나당 항상 item 1건이라 firstItem()만 제공한다.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DetailIntroResponse(Response response) {

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Response(Header header, Body body) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Header(String resultCode, String resultMsg) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Body(Items items, int numOfRows, int pageNo, int totalCount) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Items(List<DetailIntroItem> item) {}

	public boolean isSuccess() {
		return response != null
			&& response.header() != null
			&& "0000".equals(response.header().resultCode());
	}

	public String resultCode() {
		return response == null || response.header() == null ? null : response.header().resultCode();
	}

	public String resultMessage() {
		return response == null || response.header() == null ? null : response.header().resultMsg();
	}

	public DetailIntroItem firstItem() {
		if (response == null || response.body() == null || response.body().items() == null
			|| response.body().items().item() == null || response.body().items().item().isEmpty()) {
			return null;
		}
		return response.body().items().item().get(0);
	}
}
