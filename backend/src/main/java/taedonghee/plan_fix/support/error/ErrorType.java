package taedonghee.plan_fix.support.error;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;

@Getter
@RequiredArgsConstructor
public enum ErrorType {
	// 범용 에러
	INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase(), "일시적인 오류가 발생했습니다."),
	BAD_REQUEST(HttpStatus.BAD_REQUEST, HttpStatus.BAD_REQUEST.getReasonPhrase(), "잘못된 요청입니다."),
	INVALID_PASSWORD_RESET_TOKEN(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD_RESET_TOKEN", "비밀번호 재설정 링크가 유효하지 않거나 만료되었습니다. 다시 요청해 주세요."),
	RECOVERY_ACCOUNT_MISMATCH(HttpStatus.BAD_REQUEST, "RECOVERY_ACCOUNT_MISMATCH", "아이디 또는 이메일이 일치하지 않습니다."),
	PHONE_CODE_EXPIRED(HttpStatus.GONE, "PHONE_CODE_EXPIRED", "인증번호가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요."),
	PHONE_ATTEMPTS_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "PHONE_ATTEMPTS_EXCEEDED", "인증번호를 5회 잘못 입력했습니다. 인증번호를 다시 요청해 주세요."),
	PAYLOAD_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE.getReasonPhrase(), "업로드 용량 제한을 초과했습니다."),
	TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS.getReasonPhrase(), "요청이 많습니다. 잠시 후 다시 시도해 주세요."),
	SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE.getReasonPhrase(), "현재 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해 주세요."),
	NOT_FOUND(HttpStatus.NOT_FOUND, HttpStatus.NOT_FOUND.getReasonPhrase(), "존재하지 않는 요청입니다."),
	CONFLICT(HttpStatus.CONFLICT, HttpStatus.CONFLICT.getReasonPhrase(), "이미 존재하는 리소스입니다."),
	UNAUTHORIZED(HttpStatus.UNAUTHORIZED, HttpStatus.UNAUTHORIZED.getReasonPhrase(), "인증에 실패했습니다."),
	FORBIDDEN(HttpStatus.FORBIDDEN, HttpStatus.FORBIDDEN.getReasonPhrase(), "접근 권한이 없습니다.");

	private final HttpStatus status;
	private final String code;
	private final String message;
}
