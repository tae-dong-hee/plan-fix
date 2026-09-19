# 비밀번호 재설정

로그인 화면의 **비밀번호를 잊으셨나요?**에서 아이디와 가입 이메일을 입력하면, 해당 계정의
이메일로 재설정 링크를 보낸다. 링크에서 새 비밀번호를 두 번 입력한 후 로그인 화면으로 돌아간다.
카카오로만 가입한 회원은 카카오 계정의 비밀번호 찾기를 이용해야 한다.

## 메일 발송 설정

발송 서비스의 SMTP 계정과 인증된 발신 주소가 필요하다. 기본값에서는 메일 발송을 사용하지 않으며,
설정되지 않은 상태에서는 요청 API가 503을 반환하고 화면에 이용 불가 안내를 표시한다.
운영에서 기능을 사용하려면 Cloud Run의 기존 환경변수와 Secret Manager 참조에 아래 값을 추가한다.

| 환경변수 | 값 / 설명 |
| --- | --- |
| `PASSWORD_RESET_ENABLED` | `true` |
| `PASSWORD_RESET_FROM` | SMTP 서비스가 발송을 허용한 주소, 예: `noreply@example.com` |
| `FRONTEND_BASE_URL` | 운영 프런트엔드의 HTTPS 주소, 예: `https://planfix.cloud` |
| `MAIL_HOST` | SMTP 서버 호스트 |
| `MAIL_PORT` | SMTP 포트, 기본 `587` |
| `MAIL_USERNAME` | SMTP 사용자 이름 |
| `MAIL_PASSWORD` | SMTP 비밀번호 또는 앱 비밀번호. Secret Manager로 주입 |
| `MAIL_SMTP_AUTH` | SMTP 인증 사용, 기본 `true` |
| `MAIL_SMTP_STARTTLS_ENABLE` | STARTTLS 사용, 기본 `true` |
| `MAIL_SMTP_STARTTLS_REQUIRED` | STARTTLS 필수, 기본 `true` |

비밀번호나 API 키를 저장소에 기록하지 않는다. 기존 GitHub 백엔드 배포 워크플로는 Cloud Run의
환경변수와 비밀 참조를 유지하므로 SMTP 값을 워크플로에 넣을 필요가 없다.
SMTP 연결·읽기·쓰기에는 시간 제한을 둔다. 메일 발송은 DB 트랜잭션이 성공한 후 처리하며,
발송 시도가 끝날 때까지 HTTP 요청을 유지한다. Cloud Run의 요청 기반 CPU 할당에서도 응답 종료
이후의 백그라운드 스레드 실행에 의존하지 않는다.
SMTP 서버가 메일을 수락해도 실제 수신함 도착은 발송 서비스의 인증·스팸 정책에 따라 달라질 수 있다.

## 요청과 동작

- `POST /api/v1/auth/password-reset/request`: `{ "loginId": "...", "email": "..." }`
- `POST /api/v1/auth/password-reset/confirm`: `{ "token": "...", "password": "..." }`

두 API는 로그인 없이 접근하며 성공 시 `204 No Content`를 반환한다. 메일 요청은 계정 존재 여부,
이메일 일치 여부, 계정 활성 상태에 관계없이 같은 응답을 반환한다. 일치하는 활성 자체 로그인
계정에만 메일을 보내고, 같은 계정은 60초 내 재발송을 제한한다.

링크는 서버에 설정한 프런트엔드 주소로만 생성한다. 토큰은 URL fragment
(`/reset-password#token=...`)에 넣어 웹 서버 요청 URL에 포함되지 않게 한다. 화면은 토큰을
메모리에 읽은 후 주소창에서 제거하며 브라우저 저장소에 저장하지 않는다. 새로고침했다면
메일 링크를 다시 열어야 한다. 로그인 성공으로 자동 이동하지 않고 새 비밀번호로 직접 로그인한다.

토큰은 안전한 난수로 생성하며 DB에는 SHA-256 해시만 저장한다. 유효기간은 30분이고, 새 링크를
발급하면 이전 링크는 무효가 된다. 비밀번호 변경과 토큰 사용 처리를 하나의 트랜잭션으로 수행해
동시 요청에서도 한 번만 사용할 수 있다. 만료·사용·잘못된 토큰은 `400`과
`INVALID_PASSWORD_RESET_TOKEN` 코드를 반환한다. 변경 완료 시 기존 로그인 토큰도 무효가 된다.

메일 요청의 응답은 수신 여부 확인이 아니다. 화면에서는 입력한 정보가 가입 정보와 일치할 때만
메일이 발송된다는 안내를 제공한다. SMTP 발송 실패는 서버 로그에서 확인하고 설정을 수정한 뒤
60초 후 다시 요청한다. 로그에 재설정 토큰이나 전체 메일 내용을 남기지 않는다.

## 배포와 확인

1. [비밀번호 재설정 마이그레이션](migrations/2026-09-19-add-password-reset-tokens.sql)을 DB에 적용한다.
2. SMTP 설정과 운영 프런트엔드 주소를 설정하고 백엔드·프런트엔드를 배포한다.
3. 관리 가능한 테스트 계정으로 요청해 메일을 수신하고, 링크에서 비밀번호를 변경한다.
4. 새 비밀번호로 로그인되는지, 이전 비밀번호와 기존 로그인 세션은 거부되는지 확인한다.
5. 같은 링크 재사용과 만료된 링크가 거부되는지 확인한다.

테스트는 별도의 PostgreSQL Testcontainers DB와 가짜 메일 발송기를 사용한다. 자동 테스트에서는
운영 DB를 변경하거나 실제 이메일을 보내지 않는다. SMTP 수신 확인은 설정된 발송 서비스로 별도
검증해야 한다.

설계 참고: [OWASP 비밀번호 재설정 지침](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html),
[Spring Boot 메일 설정](https://docs.spring.io/spring-boot/reference/io/email.html).
