package taedonghee.plan_fix.infrastructure.spot;

import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;
import tools.jackson.databind.cfg.CoercionAction;
import tools.jackson.databind.cfg.CoercionInputShape;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.type.LogicalType;

import java.net.URI;
import java.time.Duration;
import java.util.List;

/** [infrastructure] 한국관광공사 TourAPI(areaBasedList2/detailImage2) 호출 클라이언트. */
@Component
public class TourApiClient {

	private final RestClient restClient;
	private final TourApiProperties props;

	public TourApiClient(TourApiProperties props) {
		this.props = props;
		this.restClient = RestClient.builder()
			.requestFactory(requestFactory(props))
			.configureMessageConverters(converters ->
				converters.withJsonConverter(new JacksonJsonHttpMessageConverter(tourApiJsonMapper())))
			.build();
	}

	/** 공공 API 응답이 느릴 때가 있어 타임아웃을 관대하게 잡는다. 무한 대기만 막는 게 목적. */
	private SimpleClientHttpRequestFactory requestFactory(TourApiProperties props) {
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofMillis(props.connectTimeoutMs()));
		factory.setReadTimeout(Duration.ofMillis(props.readTimeoutMs()));
		return factory;
	}

	/**
	 * TourAPI는 결과가 0건일 때 items를 객체가 아니라 빈 문자열("")로 준다.
	 * 기본 설정이면 "" -> Items 역직렬화에서 InvalidFormatException이 나므로, 빈 문자열은 null로 취급한다.
	 */
	private JsonMapper tourApiJsonMapper() {
		return JsonMapper.builder()
			.withCoercionConfig(LogicalType.POJO,
				cfg -> cfg.setCoercion(CoercionInputShape.EmptyString, CoercionAction.AsNull))
			.build();
	}

	/** 해당 법정동 시도/시군구 + 타입의 전체 건수 조회 */
	public int fetchTotalCount(String lDongRegnCd, String lDongSignguCd, int contentTypeId) {
		AreaBasedListResponse response = callAreaBasedList(lDongRegnCd, lDongSignguCd, contentTypeId, 1, 1);
		return response.totalCount();
	}

	/** 한 페이지 조회 */
	public List<AreaBasedListItem> fetchPage(String lDongRegnCd, String lDongSignguCd, int contentTypeId, int pageNo) {
		AreaBasedListResponse response =
			callAreaBasedList(lDongRegnCd, lDongSignguCd, contentTypeId, props.pageSize(), pageNo);
		return response.items();
	}

	/**
	 * detailImage2로 해당 콘텐츠의 이미지 목록을 조회한다.
	 * 정상 응답에서 이미지만 없으면 빈 리스트를 반환한다. HTTP 200이라도 TourAPI가 실패 코드로
	 * 응답한 경우는 빈 이미지로 오인하지 않도록 예외로 전파한다.
	 */
	public List<DetailImageItem> fetchDetailImages(Long contentId) {
		URI uri = URI.create(props.baseUrl() + "/detailImage2"
			+ "?serviceKey=" + props.serviceKey()
			+ "&MobileOS=" + props.mobileOs()
			+ "&MobileApp=" + props.mobileApp()
			+ "&_type=json"
			+ "&contentId=" + contentId
			+ "&imageYN=Y"
			+ "&numOfRows=" + props.pageSize()
			+ "&pageNo=1");

		DetailImageResponse response = exchange(uri, DetailImageResponse.class);
		if (response == null || !response.isSuccess()) {
			throw responseFailure("detailImage2", response == null ? null : response.resultCode(),
				response == null ? null : response.resultMessage());
		}
		return response.items();
	}

	/**
	 * detailIntro2로 해당 콘텐츠의 상세 정보를 조회한다. contentTypeId에 따라 응답 필드가 달라진다.
	 * 정상 응답에서 상세 정보가 없으면 null을 반환한다. API 오류 응답은 재시도할 수 있도록 예외로 전파한다.
	 */
	public DetailIntroItem fetchDetailIntro(Long contentId, String contentTypeId) {
		URI uri = URI.create(props.baseUrl() + "/detailIntro2"
			+ "?serviceKey=" + props.serviceKey()
			+ "&MobileOS=" + props.mobileOs()
			+ "&MobileApp=" + props.mobileApp()
			+ "&_type=json"
			+ "&contentId=" + contentId
			+ "&contentTypeId=" + contentTypeId
			+ "&numOfRows=10"
			+ "&pageNo=1");

		DetailIntroResponse response = exchange(uri, DetailIntroResponse.class);
		if (response == null || !response.isSuccess()) {
			throw responseFailure("detailIntro2", response == null ? null : response.resultCode(),
				response == null ? null : response.resultMessage());
		}
		return response.firstItem();
	}

	private RuntimeException responseFailure(String operation, String resultCode, String resultMessage) {
		// 일부 TourAPI 오류는 HTTP 429 대신 HTTP 200 + 본문 오류 코드로 온다.
		if (resultMessage != null && resultMessage.contains("LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR")) {
			return new TourApiQuotaExceededException("TourAPI 일일 요청 한도 초과: " + resultMessage);
		}
		return new TourApiResponseException(operation, resultCode, resultMessage);
	}

	/**
	 * 공통 GET. 일일 한도 초과(429)는 키 전체가 막힌 상태라 개별 실패와 구분해서 던진다.
	 * 호출부(수집 루프)가 이걸 보고 남은 건을 포기하고 즉시 중단할 수 있게 하기 위함이다.
	 */
	private <T> T exchange(URI uri, Class<T> responseType) {
		try {
			return restClient.get()
				.uri(uri)
				.retrieve()
				.body(responseType);
		} catch (HttpClientErrorException.TooManyRequests e) {
			throw new TourApiQuotaExceededException("TourAPI 일일 요청 한도 초과: " + e.getMessage());
		}
	}

	private AreaBasedListResponse callAreaBasedList(String lDongRegnCd, String lDongSignguCd, int contentTypeId,
		int numOfRows, int pageNo) {
		URI uri = URI.create(props.baseUrl() + "/areaBasedList2"
			+ "?serviceKey=" + props.serviceKey()
			+ "&MobileOS=" + props.mobileOs()
			+ "&MobileApp=" + props.mobileApp()
			+ "&_type=json"
			+ "&arrange=C"
			+ "&numOfRows=" + numOfRows
			+ "&pageNo=" + pageNo
			+ "&contentTypeId=" + contentTypeId
			+ "&lDongRegnCd=" + lDongRegnCd
			+ "&lDongSignguCd=" + lDongSignguCd);

		AreaBasedListResponse response = restClient.get()
			.uri(uri)
			.retrieve()
			.body(AreaBasedListResponse.class);

		if (response == null || !response.isSuccess()) {
			throw new CoreException(ErrorType.INTERNAL_ERROR, "TourAPI 호출 실패: contentTypeId=" + contentTypeId
				+ ", pageNo=" + pageNo);
		}
		return response;
	}
}
