package taedonghee.plan_fix.support.error;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * [support] 전역 예외 처리.
 *
 * 이 핸들러가 없으면 CoreException이 DispatcherServlet 밖으로 빠져나가고,
 * 컨테이너가 /error로 forward하면서 시큐리티 필터체인을 다시 타게 된다.
 * /error는 permitAll 대상이 아니라 결국 본문 없는 403이 나가고, 원래 에러가 통째로 가려진다.
 * 여기서 잡아 응답으로 바꿔야 ErrorType에 정의해 둔 상태 코드와 메시지가 실제로 전달된다.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

	/** 도메인·애플리케이션이 의도적으로 던진 예외. 메시지를 그대로 내보낸다. */
	@ExceptionHandler(CoreException.class)
	public ResponseEntity<ErrorResponse> handleCoreException(CoreException e) {
		ErrorType errorType = e.getErrorType();
		log.warn("CoreException: {} - {}", errorType, e.getMessage());
		return ResponseEntity.status(errorType.getStatus())
			.body(ErrorResponse.of(errorType, e.getMessage()));
	}

	/**
	 * 정적 리소스(Swagger .map 파일, 브라우저 devtools 프로빙 등) 미존재 요청.
	 * 서버 에러 로그를 오염시키지 않고 404로 응답한다.
	 */
	@ExceptionHandler(NoResourceFoundException.class)
	public ResponseEntity<ErrorResponse> handleNoResourceFoundException(NoResourceFoundException e) {
		log.debug("정적 리소스를 찾을 수 없습니다: {}", e.getResourcePath());
		ErrorType errorType = ErrorType.NOT_FOUND;
		return ResponseEntity.status(errorType.getStatus())
			.body(ErrorResponse.of(errorType, "요청한 리소스를 찾을 수 없습니다."));
	}

	/** 잘못된 JSON 값이나 숫자로 변환할 수 없는 요청 파라미터는 입력 오류로 응답한다. */
	@ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
	public ResponseEntity<ErrorResponse> handleUnreadableRequest(Exception e) {
		ErrorType errorType = ErrorType.BAD_REQUEST;
		return ResponseEntity.status(errorType.getStatus())
			.body(ErrorResponse.of(errorType, "요청 값의 형식 또는 선택 항목이 올바르지 않습니다."));
	}

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ErrorResponse> handleOversizedUpload(MaxUploadSizeExceededException exception) {
        return ResponseEntity.status(413)
                .body(new ErrorResponse("Payload Too Large", "파일 업로드 용량 제한을 초과했습니다. 더 작은 파일을 선택해 주세요."));
    }

    @ExceptionHandler({MissingServletRequestPartException.class, MissingServletRequestParameterException.class})
    public ResponseEntity<ErrorResponse> handleMissingUploadPart(Exception exception) {
        return ResponseEntity.badRequest()
                .body(ErrorResponse.of(ErrorType.BAD_REQUEST, "필수 요청 항목을 확인해 주세요."));
    }

	/**
	 * 예상하지 못한 예외. 내부 사정이 드러나지 않도록 응답에는 고정 메시지만 담고,
	 * 원인 파악에 필요한 스택트레이스는 로그로만 남긴다.
	 */
	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleException(Exception e) {
		log.error("처리되지 않은 예외", e);
		ErrorType errorType = ErrorType.INTERNAL_ERROR;
		return ResponseEntity.status(errorType.getStatus())
			.body(ErrorResponse.of(errorType, errorType.getMessage()));
	}
}
