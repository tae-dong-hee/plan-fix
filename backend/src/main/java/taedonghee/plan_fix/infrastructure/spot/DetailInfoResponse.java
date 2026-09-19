package taedonghee.plan_fix.infrastructure.spot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/** TourAPI detailInfo2 응답. 빈 items 문자열은 클라이언트의 coercion 설정으로 null 처리한다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DetailInfoResponse(Response response) {

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Response(Header header, Body body) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Header(String resultCode, String resultMsg) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Body(Items items, int numOfRows, int pageNo, int totalCount) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Items(List<DetailInfoItem> item) {}

	public boolean isSuccess() {
		return "0000".equals(resultCode()) && response.body() != null;
	}

	public String resultCode() {
		return response == null || response.header() == null ? null : response.header().resultCode();
	}

	public String resultMessage() {
		return response == null || response.header() == null ? null : response.header().resultMsg();
	}

	public List<DetailInfoItem> items() {
		if (response == null || response.body() == null || response.body().items() == null
			|| response.body().items().item() == null) {
			return List.of();
		}
		return response.body().items().item();
	}

	public int totalCount() {
		return response == null || response.body() == null ? 0 : response.body().totalCount();
	}
}
