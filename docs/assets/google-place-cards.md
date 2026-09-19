# 검수한 Google 장소 사진 카드

사진이 없는 장소 중 신원과 실제 첫 사진을 검수한 장소의 상세 화면에 기본 Places UI Kit 카드를 표시한다. 기존 사진이 있거나 승인 목록에 없으면 기존 화면을 유지한다. 목록 썸네일이나 DB의 `thumbnail`/`images`를 Google 사진으로 채우는 기능은 아니다.

## 2026-09-19 검수 결과

강릉의 사진 없는 ACTIVE 장소 555곳을 확인했다. Text Search 570회(Pro 230·Enterprise 340)로 신원을 대조했으며 사진 후보 128곳 중 **63곳 승인, 58곳 보류, 7곳 제외**로 결정했다. 나머지 427곳은 신원 검증에서 승인되지 않았다. 총 492곳에는 Google 카드를 연결하지 않는다. 승인 63곳 모두 적용 직전 운영 API의 이름·주소·좌표가 승인 기록과 같고 기존 사진이 없음을 재확인했다.

[승인 근거와 잘못된 사진 대조군](google-place-card-review-2026-09-19.json)을 보관한다. 장소별 전체 판정과 브라우저 스크린샷은 작업 artifacts에 있다. 이번 변경으로 DB 사진 보유 수가 63개 증가하는 것은 아니며 상세 카드 63개를 추가하는 것이다.

## 승인과 변경 방어

`frontend/src/constants/verified-google-places.json`에는 자체 장소 ID·원래 이름/주소/좌표와 Google place ID만 저장한다. Google 사진 파일, 사진 URL, 사진 리소스 이름은 저장하지 않는다.

- 전체 상호명·지점, 강릉시, 50m 이내 좌표, 호환 업종, 운영 상태, 해당 장소의 사진 존재를 확인한다.
- 도로명과 건물번호가 일치하거나, 자체 전체 ACTIVE 장소에서 고유한 전화번호가 일치해야 한다. 명시적인 주소·전화 모순은 승인하지 않는다.
- 첫 사진의 간판·시설명 등 장소 식별 단서를 스크린샷으로 검수한다. 다른 시설, 식별할 수 없는 실내·음식·풍경은 제외한다.
- 자체 이름/주소/좌표가 변경되거나 사진이 추가되면 연결을 즉시 사용하지 않는다. 중복 승인, 잘못된 place ID 형식도 제외한다.
- SDK가 반환한 place ID까지 승인 ID와 같아야 카드를 표시한다. 오류·시간 초과 시 기존 대체 화면을 유지한다.

Google이 카드 사진의 순서를 정한다. **검수 시점의 첫 사진은 확인했지만 이후 Google 사진 순서나 내용이 바뀌지 않는다는 보장은 없다.** 변경·오류 신고 시 해당 승인 행을 제거하고 다시 확인한다. 기본 UI Kit는 특정 사진을 영구 고정하는 저장소가 아니다.

## 표시와 출처

`gmp-place-details-compact` 기본 요소를 세로 방향, 최대 300px로 표시한다. 화면에 들어올 때 한 번 로드하며 상세 사진 확대 화면과 Google/촬영자 출처를 유지한다. `출처 및 이용 안내`에서 Google Maps 이용 조건과 개인정보처리방침을 확인할 수 있다. SDK는 한번만 로드하고, Google 지도 객체나 Advanced 요소는 만들지 않는다.

## 설정과 비용

빌드 시 공개 브라우저 설정 `VITE_GOOGLE_MAPS_API_KEY`를 주입한다. 값이 없으면 Google 카드는 표시하지 않는다. 운영 키는 `https://planfix.cloud/*`와 Maps JavaScript API·Places UI Kit API로 제한한다. 로컬 검증 키는 별도로 발급하고 검증 후 삭제한다.

2026-09-19 기준 planfix-01의 기본 UI Kit 쿼리 제한은 하루 600회다. 31일 최대 18,600회이며, 월 무료 10,000회를 모두 이 프로젝트가 쓸 수 있다는 전제에서 초과 비용은 크레딧 적용 전 $8.60다. Pro 구독의 월 $10 Cloud 크레딧은 기존 결제 계정에 연결했으며 **다른 Cloud 사용료와 공유된다.** 따라서 구독이 있다는 이유만으로 사진 비용의 현금 결제가 항상 0원이라고 보장하지 않는다. 서비스별 무료량은 결제 계정 전체 사용량 기준으로 확인해야 한다.

Advanced UI Kit, UI Kit 자동완성, Google 지도 로드, 일반 Places Photo Media 등 사용하지 않는 일일 쿼터는 0이다. 신원 감사에만 임시 허용한 Places Text Search는 감사 후 0으로 되돌린다. 한도 초과 시 카드가 실패하고 기존 대체 화면을 표시한다. 이는 경고만 보내는 예산 알림과 다르다.

운영 시 확인할 항목은 승인 수, 무료량/크레딧 잔액, 기본 UI Kit 사용량, 카드 오류, 사진 변경 신고다. 재검수 없이 이름 검색 결과를 자동 승인하지 않는다.

## 공식 근거

- [Places UI Kit 구성과 과금](https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview#billing): 기본/고급 요소 및 요소 생성별 과금, 내부 사진 요청의 추가 요금 없음.
- [Google Maps 가격](https://developers.google.com/maps/billing-and-pricing/pricing): SKU별 월 무료량과 초과 단가.
- [Google Developer Program 혜택](https://developers.google.com/profile/help/benefits): Pro Cloud 크레딧과 연결 조건.
- [지도 서비스별 약관](https://cloud.google.com/maps-platform/terms/maps-service-terms): Places UI Kit 사용 조건.
- [Places API 정책](https://developers.google.com/maps/documentation/places/web-service/policies): place ID와 콘텐츠 저장 제한.
