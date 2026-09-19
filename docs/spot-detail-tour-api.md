# 장소 소개 · 이용 안내 수집

장소 상세 화면은 `GET /api/v1/spots/{spotId}`로 DB에 수집된 정보를 읽습니다. 외부 API를 화면 요청마다 호출하지 않으므로 공공 API의 지연이나 장애가 상세 화면을 막지 않습니다. 수집은 관리자 API에서 실행하며, 기존 `TOUR_API_SERVICE_KEY`를 서버에서 사용합니다.

데이터 제공기관은 **한국관광공사**입니다. [공공데이터포털 국문 관광정보 서비스 공식 명세](https://www.data.go.kr/data/15101578/openapi.do)를 사용합니다.

| 화면 정보 | 외부 API | 저장 · 표시 |
| --- | --- | --- |
| 이런 곳이에요 | `KorService2/detailCommon2`의 `overview` | `spots.description` → `description` |
| 이용시간 · 휴무일 · 전화 · 주차 · 메뉴 | `KorService2/detailIntro2`의 유형별 필드 | `tour_data_info` → `info` |
| 추가 안내(이용요금 · 부대시설 등) | `KorService2/detailInfo2`의 `infoname`, `infotext` | `tour_data_info.additional_info` → `info.additionalInfo` |
| 사진 | 기존 `KorService2/detailImage2` | `tour_data_images` → `images` |

기본 주소는 `https://apis.data.go.kr/B551011/KorService2`입니다. 모든 요청에 `serviceKey`, `MobileOS=ETC`, `MobileApp=planfix`, `_type=json`을 사용하고, 장소의 원본 `contentId`로 조회합니다. `detailIntro2`와 `detailInfo2`에는 원본 `contentTypeId`도 필요합니다. `detailCommon2`의 소개는 기본 응답에 포함되므로 구형 `overviewYN` 등의 플래그를 사용하지 않습니다.

## 수집 실행

먼저 추가 안내 컬럼 마이그레이션을 적용한 다음 백엔드를 배포합니다. 관리자 인증이 적용된 수집 API는 시도와 시군구를 함께 받습니다. 아래는 강원특별자치도 양양군 예시입니다.

```http
POST /api/v1/admin/spots/collect-descriptions?lDongRegnCd=51&lDongSignguCd=830
POST /api/v1/admin/spots/collect-info?lDongRegnCd=51&lDongSignguCd=830
POST /api/v1/admin/spots/collect-additional-info?lDongRegnCd=51&lDongSignguCd=830
```

소개 수집과 추가 안내 수집은 활성(`ACTIVE`) 한국관광공사 원천(`TOUR_API`) 장소의 미수집 필드만 채웁니다. 소개·추가 안내의 `NULL`은 미수집이며, 빈 문자열은 정상 응답에 해당 정보가 없었던 경우입니다. API 오류나 일일 할당량 초과는 완료로 기록하지 않으며, 동일 요청을 다시 실행하면 미처리 항목을 이어서 수집합니다. 성공한 빈 결과와 이미 있는 값은 재수집하지 않습니다.

추가 안내는 `12` 관광지, `14` 문화시설, `15` 축제, `28` 레포츠, `38` 쇼핑, `39` 음식점의 제목·내용 반복 필드를 사용합니다. 숙박(`32`)의 객실 정보와 여행코스(`25`)의 코스 구성 정보는 응답 구조가 달라 이번 추가 안내 수집에 포함하지 않습니다.

기본 이용 안내 수집은 기존 `info_collected_at`이 없는 항목을 대상으로 합니다. 과거 정상 빈 응답으로 기록된 항목의 재검증은 원본을 확인하는 별도 작업이 필요합니다. 축제의 `usetimefestival`은 이용요금이므로 이용시간으로 표시하지 않으며, 공연시간인 `playtime`을 사용합니다.

외부 호출을 긴 DB 트랜잭션으로 묶지 않고 결과를 건별 저장합니다. 소개 저장은 소개 필드만 조건부로 갱신하며, 목록 재수집에서도 이미 수집한 소개를 보존합니다. 추가 안내 저장도 기본 이용 안내를 보존합니다. API 응답의 HTML은 프런트엔드에서 안전한 텍스트로 변환하며, 줄바꿈을 유지합니다.

## 하늘빛계곡 캠핑장 확인 사례

2026-09-19 조회 기준 `spotId=4859`, `contentId=2757177`, `contentTypeId=28`입니다.

- `detailCommon2`: 캠핑장 소개가 있습니다.
- `detailIntro2`: HTTP 200, `resultCode=0000`, `totalCount=0`의 정상 빈 응답입니다.
- `detailInfo2`: **이용요금**과 **부대시설(샤워실)**이 있습니다. 가격 변동 가능 안내를 포함해 원본 내용을 표시합니다.

기본 이용 안내가 비어 있어도 추가 안내를 확인해야 하는 사례입니다. 어느 API에도 없는 정보는 임의로 생성하지 않습니다.
