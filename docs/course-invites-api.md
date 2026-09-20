# 공동 코스 초대 API

카카오톡 공유 버튼은 프론트에서 `inviteUrl`을 카카오 공유 메시지의 링크로 넣으면 된다.
초대 링크는 생성 시점부터 7일간 유효하며 같은 링크로 여러 사용자가 참여할 수 있다.

## 초대 링크 생성

`POST /api/v1/courses/{courseId}/invites`

전체 공개(`PUBLIC`) 코스의 소유자만 호출할 수 있다. `memberRole`은 `VIEWER` 또는 `EDITOR`다.
나만 보기(`PRIVATE`) 코스는 먼저 소유자가 공개 범위를 변경해야 한다.

```json
{ "memberRole": "EDITOR" }
```

```json
{
  "token": "...",
  "inviteUrl": "https://frontend.example.com/course-invites/...",
  "memberRole": "EDITOR",
  "expiresAt": "2026-09-17T10:00:00Z"
}
```

## 초대 링크 미리보기

`GET /api/v1/course-invites/{token}`

인증 없이 호출 가능하다. 링크를 연 비회원 화면에서 코스 제목과 권한을 보여주고,
회원가입 또는 로그인으로 유도한다.

## 초대 수락

`POST /api/v1/course-invites/{token}/accept`

로그인이 필요하다. 비회원 요청은 `401 Unauthorized`이므로 가입/로그인 완료 후 같은 요청을
재시도한다. 한 사용자에게 같은 코스의 멤버 레코드와 권한은 하나만 존재한다.
이미 참여한 사용자가 **더 새로 발급된 초대**를 수락하면 링크의 읽기/편집 권한으로 갱신한다.
권한의 대소가 아니라 발급 순서를 비교한다. 같은 링크를 반복 수락하거나 더 오래된 링크를 수락하면 현재 권한을 유지한다.
소유자가 멤버 관리에서 직접 변경한 권한은 변경 당시까지 발급된 링크를 다시 수락해도 덮어쓰지 않는다.
그 뒤 새로 발급한 링크를 수락하면 다시 권한을 갱신할 수 있다.
내보낸 사용자는 제거 당시까지 발급된 링크로 다시 참여할 수 없으며, 소유자가 새로 발급한 초대가 필요하다.

## 멤버 관리

- `GET /api/v1/courses/{courseId}/members` — 소유자만 멤버 목록 조회
- `DELETE /api/v1/courses/{courseId}/members/{memberUserId}` — 소유자만 멤버 내보내기
- `PATCH /api/v1/courses/{courseId}/members/{memberUserId}` — 소유자만 권한 변경 (`{"role":"VIEWER"}` 또는 `{"role":"EDITOR"}`)
- `GET /api/v1/courses/{courseId}/invites` — 소유자만 유효한 초대 목록 조회
- `DELETE /api/v1/courses/{courseId}/invites/{token}` — 소유자만 초대 취소

`VIEWER`는 일정·메모·숙소 조회만 가능하다. `EDITOR`는 `PATCH /api/v1/courses/{courseId}`로
일정·메모를 수정하고 `PUT /api/v1/courses/{courseId}/day-accommodations`로 숙소를 수정할 수 있다.
코스 수정 시 조회 응답의 `updatedAt`을 `expectedUpdatedAt`으로 전송해야 한다.
공개 코스의 일반 방문객에게 숙소 정보는 공개하지 않는다.

상세와 내 코스 목록 응답의 `canEdit`은 소유자와 `EDITOR`에게 참이고,
`canViewAccommodations`는 소유자와 초대받은 `VIEWER`·`EDITOR`에게 참이다.
코스 삭제·공개 범위 변경·멤버 및 초대 관리는 소유자만 가능하다.
소유자가 코스를 나만 보기로 변경하면 멤버 권한과 초대 링크를 폐기한다.

## 카카오톡 공유 완료 확인

공유 완료는 친구의 초대 수락과 별개다. 카카오가 채팅방 전송 성공을 알린 후
공유창에 `카카오톡 공유 완료`를 표시하고, `확인`을 누르면 창을 닫는다.
공유창 열기, 앱으로 이동했다 돌아오기, 링크 복사만으로 완료로 표시하지 않는다.

- SDK `serverCallbackArgs`에 `invite_token`과 공유 시도마다 새로 생성한 UUID `share_request_id`를 보낸다.
- 카카오가 `POST /api/v1/webhooks/kakao/share`로 JSON 웹훅을 보내면 서버가 대표 어드민 키를 검증하고 전송 확인을 DB에 저장한다.
- 로그인한 초대 생성자만 `GET /api/v1/course-invites/{token}/kakao-shares/{requestId}`로 `{ "shared": true|false }`를 조회할 수 있다.
- 창이 열려 있는 동안 1.5초 간격으로 최대 5분간 확인한다. 백그라운드에서는 조회하지 않고 복귀 시 바로 조회한다. 닫기·재시도 시 이전 조회를 중단한다.
- 취소·오류·응답 지연은 성공으로 간주하지 않는다. 새 공유 시도는 이전 전송 확인과 분리된다.
- 카카오 공유 버튼 외의 일반 링크 복사/다른 앱 공유는 최종 카카오 전송 여부를 알 수 없어 자동 완료 대상이 아니다.

### 운영 설정 (자동 완료 확인에 필수)

1. DB에 `docs/migrations/2026-09-20-add-kakao-share-receipts.sql`을 적용한다. 현재 `ddl-auto: update` 환경은 같은 테이블을 자동 생성한다.
2. 백엔드 비밀 환경변수 `KAKAO_ADMIN_KEY`에 카카오 앱의 **대표 어드민 키**를 설정한다. JavaScript 키나 REST API 키가 아니며 프론트로 노출하면 안 된다.
3. 카카오디벨로퍼스 **앱 → 웹훅 → 카카오톡 공유 웹훅**에 공개 HTTPS 백엔드의 `/api/v1/webhooks/kakao/share` URL을 등록하고 메서드를 **POST**로 설정한다.
4. 프론트와 백엔드를 배포한 뒤 실제 채팅방 전송 → 완료 표시 → 확인으로 닫기를 점검한다. 설정 전에는 실제 전송이 되어도 완료 표시를 자동으로 받을 수 없다.

공식 규격: https://developers.kakao.com/docs/ko/kakaotalk-share/callback

## 권한과 초대 링크의 구분

코스별 멤버 권한은 `course_members(course_id, user_id)`의 유일 제약과 단일 `role`로 관리한다.
편집/읽기 초대 링크가 여러 개 있어도 한 사람에게 권한이 중복 부여되지 않는다.
기존 편집 멤버가 더 새로 발급한 읽기 링크를 수락하면 읽기, 기존 읽기 멤버가 더 새로 발급한 편집 링크를 수락하면 편집으로 갱신한다.
중복·과거 링크 수락은 더 최신의 적용 권한을 바꾸지 않는다. 초대 취소는 링크만 폐기하며 기존 멤버를 제거하지 않는다.

`course_members.last_applied_invite_id`는 마지막으로 적용한 초대 순서(또는 소유자 변경 당시까지의 순서)를 기록한다.
모든 수락·권한 변경·회수는 코스 행 잠금 안에서 처리한다. 동시 수락은 실행 순서와 관계없이 더 최신 발급 초대의 권한 하나로 수렴한다.
직접 변경·회수 전에 발급한 링크는 변경·회수를 되돌리지 못한다.

기존 멤버의 NULL 값은 새 초대 발급 직전에 기존 링크의 최대 순서로 초기화한다.
이전 버전에서 발급한 링크를 먼저 다시 수락하는 경우에도 현재 권한을 보존하면서 초기화한다.
따라서 과거 링크로 기존 권한을 되돌릴 수 없으며, 배포 후 새로 만든 초대부터 권한 갱신이 가능하다.
스키마 수동 관리 환경은 `docs/migrations/2026-09-20-add-member-invite-order.sql`을 적용한다.
현재 운영의 `ddl-auto: update`는 nullable 컬럼을 자동 생성한다.
