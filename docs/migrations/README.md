# Database migrations

이 디렉터리의 SQL은 PostgreSQL 스키마 변경 이력이다. 이미 배포된 파일은 수정하지 않고,
새 변경은 날짜와 의도를 담은 새 파일로 추가한다.

## 적용 순서

1. `2026-08-23-add-users-name.sql` — 사용자 이름 컬럼
2. `2026-08-24-create-spot-likes.sql` — 스팟 좋아요
3. `2026-08-26-create-course-tables.sql` — 코스, 코스 일정, 코스 좋아요
4. `2026-08-27-create-board-tables.sql` — 게시글, 게시글 이미지, 게시글 좋아요, 댓글
5. `2026-09-02-add-course-days.sql` — 코스 여행 기간과 일차
6. `2026-09-10-ensure-comments-table.sql` — 기존 GCP DB에서 누락된 댓글 테이블 보정
7. `2026-09-10-add-course-invites.sql` — 카카오톡 공유 링크 기반 공동 코스 초대·멤버 권한

6번은 4번이 적용된 새 DB에서는 `IF NOT EXISTS`에 의해 변경 없이 끝난다. 반대로 현재
GCP처럼 게시글 테이블은 있지만 댓글 테이블이 없는 환경에서는 댓글 테이블과 인덱스만 만든다.

7번은 초대 링크(`course_invites`)와 공동 코스 멤버(`course_members`)를 만든다. 초대 링크에는
`VIEWER` 또는 `EDITOR` 권한이 포함되며, 링크를 연 비회원은 회원가입/로그인 후 수락해야 한다.

`2026-09-15-add-course-generation-metadata.sql`은 코스 생성 방식(`generated_by`)과 선택 테마(`themes`)를 추가한다.
이 변경을 사용하는 백엔드를 시작하기 전에 적용해야 한다. 기존 코스의 출처와 테마는 추정해 채우지 않는다.
API의 `generatedBy`는 `LLM`, `RULE_BASED`, `MANUAL` 중 하나이며 이전 코스는 `null`이다.
`themes`는 선택 순서대로 `HEALING`, `FOOD`, `CAFE`, `ACTIVITY`, `CULTURE` 코드를 받는다.
수정 요청에서 생성 방식·테마를 생략하거나 `null`로 보내면 기존 값을 유지하고, `themes: []`는 선택을 지운다.

`2026-09-19-hide-leaked-gangneung-test-spots.sql`은 서비스 DB에 남은 강릉 테스트 장소 6건을
숨기는 데이터 보정이다. 감사에서 확인한 ID·원본 contentid·제목·좌표·이미지 등 모든 조건이
일치할 때만 적용하며, 실제 경포해수욕장(`spot_id=429`, TourAPI `contentid=128758`)은 유지한다.
가짜 경포해수욕장에 저장된 코스는 정상 장소로 연결하고 좋아요는 사용자별로 정상 장소에 보존한다.
원본 테스트 행과 기존 좋아요는 삭제하지 않는다. 재실행 시 추가 변경은 없다.
적용 전 관련 `spots`, `tour_data_spots`, `course_spots`, `spot_likes` 행을 백업해야 한다.
확인한 fixture와 다르거나 ‘원래 제목’에 사용자 연결이 생겼다면 자동 적용을 중단한다.

## 적용 원칙

- 운영·공유 DB에는 `ddl-auto: validate`를 사용한다. Hibernate가 스키마를 변경하지 않게 한다.
- SQL은 트랜잭션으로 적용하고, 오류가 나면 즉시 중단한다.
- 기존 마이그레이션 파일의 내용을 수정하지 않는다. 보정이 필요하면 새 파일을 만든다.
- 엔티티에 테이블·컬럼·인덱스·제약이 추가될 때만 해당 도메인용 SQL을 새로 추가한다.

## 수동 적용 예시

원격 DB 연결 정보가 환경 변수로 주입된 환경에서는 다음처럼 실행한다.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f docs/migrations/2026-09-10-ensure-comments-table.sql
```

로컬 Docker 컨테이너에서는 컨테이너명과 DB명을 확인한 뒤 실행한다.

```bash
docker exec -i docker-postgres-1 psql -U planfix -d planfix -v ON_ERROR_STOP=1 \
  < docs/migrations/2026-09-10-ensure-comments-table.sql
```

## 프로필 사진 (2026-09-19)

`2026-09-19-add-user-profile-image.sql`을 새 백엔드 배포 전에 적용한다. `users.profile_image_key`는
비공개 S3 객체 키이며, `default_avatar_color`는 `violet`, `blue`, `green`, `amber`, `rose` 중 하나다.
기존 회원에게 한 번만 무작위 색상을 배정하고 재실행 시 유지한다. 신규 회원도 한 번 배정받은 색상을
계속 사용하며 사진 변경·삭제로 색상이 바뀌지 않는다. DB 기본값도 무작위 색상을 생성하므로 배포 중
기존 백엔드에서 가입한 회원과 외부 삽입도 `NOT NULL` 제약을 만족한다.

기존 S3 연결 설정을 사용한다. 애플리케이션 IAM에 버킷의 `users/*/profile/*` 객체에 대한
`s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` 권한이 필요하다. 객체 공개 권한은 필요 없다.
인증된 `GET /api/v1/users/me/profile-image`가 자기 사진만 제공하고 캐시는 저장하지 않는다.
`POST`는 multipart 필드 `file`을 받아 즉시 저장하며 `DELETE`는 기존 기본 아바타로 복원한다.
두 응답 모두 `profileImageUrl`, `defaultAvatarColor`를 포함한 사용자 정보다.

프로필 사진은 5MB 이하의 JPEG, PNG, 정지 WebP를 지원한다. 파일명 대신 실제 파일 헤더와 크기를
검증하고 세 형식 모두 디코딩까지 확인한다. WebP 디코딩에는 TwelveMonkeys ImageIO를 사용한다.
최대 가로·세로 8,192px, 2,000만 화소까지 허용한다. 기존 게시글 업로드를 유지하기 위해 전역
multipart 제한은 파일 15MB, 요청 16MB이며 프로필 서비스에서 별도 5MB 제한을 적용한다.
