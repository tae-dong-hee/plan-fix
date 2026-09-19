# 이메일로 아이디 찾기와 비밀번호 재설정

로그인 화면의 **아이디 찾기**에서 가입 이메일을 입력하면 해당 메일함으로 아이디를 보낸다.
메일의 로그인 또는 비밀번호 찾기 링크로 이어갈 수 있다. **비밀번호 찾기**에서는 아이디와
가입 이메일을 확인하고 일회용 재설정 링크를 보낸다. 링크에서 새 비밀번호를 설정한 뒤 로그인한다.
아이디나 임시 비밀번호를 공개 화면에 바로 표시하지 않는다. 카카오 전용 회원은 카카오 로그인을 사용한다.

## 실제 발송 설정

기존 SMTP 메일 설정을 두 기능이 함께 사용한다. [설정 항목](password-reset.md)과
[입력 양식](../backend/.env.example)을 참고한다. 문자 발송 서비스나 전화번호 등록은 필요 없다.

네이버 메일을 사용하는 경우:

1. PC 네이버 메일의 `환경설정 → POP3/IMAP 설정 → POP3/SMTP 설정`에서 `사용함`을 선택하고 저장한다.
2. 네이버 계정의 2단계 인증을 설정하고 `PlanFix` 전용 애플리케이션 비밀번호를 발급한다.
3. SMTP 호스트 `smtp.naver.com`, 포트 `465`, SSL `true`, STARTTLS enable/required `false`를 사용한다.
4. 발신 계정의 사용자 이름·메일 주소·앱 비밀번호를 서버 환경에 설정한다. `PASSWORD_RESET_ENABLED=true`로 두 메일 기능을 켠다.
5. SMTP 연결·접수뿐 아니라 테스트 수신함 도착과 링크를 통한 재설정도 확인한다.

공식 안내: [네이버 SMTP 설정](https://help.naver.com/service/30029/contents/21341?lang=ko&osType=PC),
[앱 비밀번호 발급](https://help.naver.com/service/5640/contents/8584?lang=ko).

비밀번호는 Git에서 제외한 `.env.recovery` 또는 Secret Manager에 저장한다. 로컬 파일은 권한을
`600`으로 제한하고 채팅·로그·화면 캡처에 비밀값을 남기지 않는다. Spring은 `.env.recovery`를
자동으로 읽지 않으므로 실행 환경변수나 운영 Secret Manager 참조로 주입해야 한다.

## API

기본 접두사는 `/api/v1`이다. 성공 응답은 `204 No Content`와 `Cache-Control: no-store`이다.

| API | 요청 | 결과 |
| --- | --- | --- |
| `POST /auth/id-recovery/request` | `{email}` | 일치하는 활성 자체 로그인 계정의 아이디를 메일로 발송 |
| `POST /auth/password-reset/request` | `{loginId,email}` | 일치하는 계정의 이메일로 재설정 링크 발송 |
| `POST /auth/password-reset/confirm` | `{token,password}` | 비밀번호 변경, 사용한 링크 및 기존 로그인 세션 무효화 |

아이디 찾기는 메일함에 접근할 수 있어야 결과를 알 수 있다. HTTP 응답으로 아이디를 반환하지 않는다.
과거 데이터에 이메일의 `@` 앞부분 대소문자가 다른 계정이 여러 개 있으면 입력한 대소문자와
정확히 일치하는 그룹만 선택한다. 모호한 입력은 거절하며 서로 다른 수신 주소의 아이디를
한 곳으로 모아 보내지 않는다. 항상 저장된 가입 이메일로 발송한다. 자체 로그인 계정이 없으면
`400 RECOVERY_EMAIL_MISMATCH`이다.
비밀번호 찾기에서 아이디·이메일이 다르면 `400 RECOVERY_ACCOUNT_MISMATCH`이다.

메일 요청은 SMTP가 수락한 뒤에만 성공한다. 설정 누락·제공자 거절·연결 실패는 `503`이고,
횟수 제한은 `429`이다. 잘못되거나 만료·사용된 비밀번호 재설정 토큰은
`400 INVALID_PASSWORD_RESET_TOKEN`이다. SMTP의 접수와 실제 받은편지함 도착은 별도로 확인한다.

## 제한과 배포

아이디 찾기는 이메일별 60초 간격·시간당 5회, 비밀번호 메일은 아이디별 시간당 20회와
동일 계정 60초 간격으로 제한한다. 실패한 요청도 별도 커밋한 횟수 제한을 우회하지 못한다.
프록시 공유 환경의 추가 요청 제한은 [설명](account-recovery-request-limits.md)을 참고한다.

토큰은 30분간 유효하고 한 번만 사용한다. URL fragment에서 읽은 뒤 주소창에서 제거한다.
DB에는 원문 대신 해시를 보관하고, 새 링크 발급 시 이전 링크는 무효화한다.
비밀번호 변경과 토큰 사용은 동일 트랜잭션에서 수행하며 기존 로그인 세션도 무효가 된다.

배포 전 [비밀번호 토큰](migrations/2026-09-19-add-password-reset-tokens.sql)과
[복구 요청 제한](migrations/2026-09-19-add-account-recovery-rate-limits.sql) 테이블이 필요하다.
운영의 기존 환경변수를 보존하면서 SMTP 환경변수와 비밀 참조만 추가한다.
현재 검증 결과는 [검증 기록](account-recovery-verification.md)을 참고한다.
