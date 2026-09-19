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
재시도한다. 이미 참여한 사용자가 다시 호출해도 성공 응답을 돌려주며 기존 권한을 유지한다.
소유자가 변경한 권한은 예전 링크를 다시 수락해도 덮어쓰지 않는다.
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
