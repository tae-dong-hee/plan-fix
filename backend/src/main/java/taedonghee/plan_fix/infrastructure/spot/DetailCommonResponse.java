package taedonghee.plan_fix.infrastructure.spot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

/** TourAPI detailCommon2 응답. 정상적인 빈 items와 API 오류를 구분한다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DetailCommonResponse(Response response) {

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Response(Header header, Body body) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Header(String resultCode, String resultMsg) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Body(Items items, int totalCount) {}

	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Items(List<DetailCommonItem> item) {}

	public boolean isSuccess() {
		return "0000".equals(resultCode()) && response.body() != null;
	}

	public String resultCode() {
		return response == null || response.header() == null ? null : response.header().resultCode();
	}

	public String resultMessage() {
		return response == null || response.header() == null ? null : response.header().resultMsg();
	}

	public DetailCommonItem firstItem() {
		if (response == null || response.body() == null || response.body().items() == null
			|| response.body().items().item() == null || response.body().items().item().isEmpty()) {
			return null;
		}
		return response.body().items().item().getFirst();
	}

	public int totalCount() {
		return response == null || response.body() == null ? 0 : response.body().totalCount();
	}
}
