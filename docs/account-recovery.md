# 아이디 찾기와 비밀번호 재설정

로그인 → 아이디 찾기 → 등록된 휴대폰으로 문자 인증 → 아이디 확인 → 로그인 또는
비밀번호 재설정으로 연결된다. 비밀번호 찾기 화면에서는 아이디·이메일로 재설정 메일을
받거나, 아이디·등록된 휴대폰으로 문자 인증 후 새 비밀번호를 설정한다.

기존 회원 정보에는 휴대폰번호가 없었다. 기존 회원은 로그인 후 프로필에서 **현재 비밀번호와
문자 인증**으로 복구용 번호를 등록한다. 새 회원은 가입 중 선택적으로 문자 인증을 하고,
가입 성공 시 검증된 번호가 계정에 연결된다. 사전에 인증·등록하지 않은 번호로 기존 계정을
추정하거나 연결하지 않는다. 카카오 전용 계정은 카카오 로그인을 사용한다.

## 실제 발송 준비

메일은 [SMTP 설정](password-reset.md)에 따라 인증된 발신 주소와 SMTP 자격증명을 설정한다.
문자는 SOLAPI의 API 키·Secret과 사전 등록된 발신번호가 필요하다.

| 환경변수 | 설명 |
| --- | --- |
| `SMS_ENABLED` | 실제 문자 기능을 켤 때 `true` |
| `SOLAPI_API_KEY` | SOLAPI API 키. Secret Manager로 주입 |
| `SOLAPI_API_SECRET` | HMAC 서명용 Secret. Secret Manager로 주입 |
| `SMS_FROM` | SOLAPI에 등록된 발신번호, 숫자만 입력 |
| `SOLAPI_API_BASE_URL` | 기본 `https://api.solapi.com`; 다른 호스트·HTTP·리디렉션은 거절 |

비밀값을 저장소·문서·채팅에 기록하지 않는다. 설정 누락은 `503`으로 표시하며, 모의 발송을
성공처럼 표시하지 않는다. 문자 요청은 SOLAPI의 개별 메시지 접수 결과까지 확인한 뒤 응답한다.
로컬 입력 양식은 [backend/.env.example](../backend/.env.example)이다. `.env.recovery`로 복사하고
파일 권한을 `600`으로 제한한다. 이 파일은 Git에서 제외되며 Spring이 자동으로 읽지 않으므로,
실행 환경변수 또는 운영 Secret Manager 참조에 별도로 주입해야 한다.
제공자가 접수해도 실제 도착은 별도 확인해야 한다. 메일·문자 모두 HTTP 응답 이후의
백그라운드 실행에 의존하지 않아 Cloud Run 요청 기반 CPU 할당에서 처리할 수 있다.

공식 문서: [SOLAPI 메시지 발송](https://solapi.com/developers/api/messages),
[HMAC 인증](https://solapi.com/developers/api/authentication-api-key).

## API 계약

모든 경로의 기본 접두사는 `/api/v1`이다. 인증·복구 응답은 `Cache-Control: no-store`이다.

| API | 요청 / 결과 |
| --- | --- |
| `POST /auth/password-reset/request` | `{loginId,email}` → SMTP 접수 `204`, 불일치 `400`, 제한 `429`, 발송 실패 `503` |
| `POST /auth/password-reset/confirm` | `{token,password}` → `204`, 기존 세션과 토큰 무효화 |
| `POST /auth/phone/request` | `{purpose,phoneNumber,loginId?}` → `{challengeId,expiresIn:300,resendAfter:60}` |
| `POST /auth/phone/confirm` | `{challengeId,code}` → 아래 목적별 결과 |
| `GET /users/me/recovery-phone` | 로그인 필요 → `{phoneNumber:마스킹된번호또는null}` |
| `POST /users/me/recovery-phone/request` | 로그인 필요, `{phoneNumber,password}` → 인증번호 발송 |
| `POST /users/me/recovery-phone/confirm` | 로그인 필요, `{challengeId,code}` → 번호 등록, 마스킹한 번호 반환 |

공개 인증 목적은 `SIGNUP`, `FIND_ID`, `RESET_PASSWORD`이다. `RESET_PASSWORD` 요청은
아이디도 필요하다. 확인 성공 결과에는 목적에 따라 다음 값이 포함된다.

- `SIGNUP`: 가입 요청에 넣을 `phoneVerificationToken`에 해당하는 `verificationToken`.
- `FIND_ID`: `loginId`, 비밀번호 변경용 `passwordResetToken`.
- `RESET_PASSWORD`: `passwordResetToken`.

가입 증명은 `POST /users`에 선택 필드 `phoneVerificationToken`으로 제출한다.
휴대폰번호 자체를 보내서 인증을 건너뛰는 방식은 허용하지 않는다. 가입 실패 시 증명 사용도
롤백하여 다시 시도할 수 있다. 하나의 번호는 하나의 계정에만 등록할 수 있다.

## 검증·제한

인증번호는 안전한 난수 6자리이며 5분 동안 유효하고, 5번 실패하면 다시 발급받아야 한다.
새 발급은 이전 대기 인증을 무효화한다. 번호별 재요청 간격은 60초, 시간당 최대 5회이다.
인증번호 오입력과 발송 실패도 DB에 보존되는 횟수 제한을 우회하지 못한다.
메일 요청은 아이디별 시간당 20회로 제한한다. 프록시를 공유하는 요청의 넉넉한 공동 상한과
설정 방법은 [요청 제한 설명](account-recovery-request-limits.md)을 참고한다.
가입 증명은 15분, 비밀번호 변경 토큰은 30분 동안 유효하며 한 번만 사용한다.
DB에는 인증번호·증명의 원문 대신 목적·문맥을 묶은 HMAC 해시를 저장한다.
비밀번호 변경 토큰은 SHA-256 해시로 저장한다.

서로 다른 계정·목적의 인증번호, 변경된 등록번호, 만료·재사용 토큰은 거절한다.
동시에 확인하더라도 계정과 인증 레코드를 잠가 한 번만 처리한다. 재설정 완료 후 이전
비밀번호와 기존 로그인 세션은 사용할 수 없다.

## 운영 반영과 실수신 검증

1. [비밀번호 토큰](migrations/2026-09-19-add-password-reset-tokens.sql)과
   [휴대폰 인증](migrations/2026-09-19-add-phone-recovery.sql) 마이그레이션을 적용한다.
2. SMTP·SOLAPI 비밀 참조와 발신자를 Cloud Run에 설정하고 백엔드·프런트엔드를 배포한다.
3. 관리 가능한 테스트 계정·수신 이메일·휴대폰을 사용하여 외부 메일과 문자 도착을 확인한다.
4. 가입 인증, 프로필 번호 등록, 아이디 찾기, 두 경로의 비밀번호 변경과 새 비밀번호 로그인을 확인한다.
5. 틀린 이메일·아이디·번호·인증번호, 만료·횟수 초과·재사용·동시 요청을 확인한다.
6. 공급자 장애 시 성공 안내가 나오지 않는지, 이전 비밀번호·세션은 재설정 전까지 유지되는지 확인한다.

현재 로컬 자동 검증은 일회용 PostgreSQL, SMTP 소켓 서버, HTTP 문자 공급자 모형을 사용한다.
외부 SMTP·SOLAPI 자격증명과 테스트 수신자 설정 전에는 **실수신 검증 미완료**로 구분해야 한다.
로컬 테스트 통과나 공급자의 접수 응답만으로 실제 메일·문자 도착을 완료 처리하지 않는다.
