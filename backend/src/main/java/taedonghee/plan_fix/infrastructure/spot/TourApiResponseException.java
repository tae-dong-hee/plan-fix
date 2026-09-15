package taedonghee.plan_fix.infrastructure.spot;

/**
 * TourAPI가 HTTP 요청은 받았지만 응답 본문에서 실패를 알린 경우의 예외다.
 *
 * <p>HTTP 200이어도 resultCode가 0000이 아닐 수 있다. 이를 빈 데이터로 바꾸면
 * 수집기가 "이미지가 없음"으로 오인해 수집 완료 시각을 기록하게 되므로, 호출부가
 * 재시도 대상으로 남길 수 있도록 별도 예외로 전파한다.</p>
 */
public class TourApiResponseException extends RuntimeException {

	public TourApiResponseException(String operation, String resultCode, String resultMessage) {
		super("TourAPI 응답 실패: operation=" + operation
			+ ", resultCode=" + (resultCode == null ? "unknown" : resultCode)
			+ ", resultMessage=" + (resultMessage == null ? "empty response" : resultMessage));
	}
}
