# 공통 장소 사진 갤러리

Google 전용 작은 카드 대신 기존 장소 상세와 같은 갤러리를 사용할 수 있다. 첫 사진이 기본 대표사진이며, 이전/다음 버튼과 썸네일로 다른 사진을 선택한다. 일반 장소도 같은 `SpotPhotoGallery` 컴포넌트를 사용한다.

`VITE_GOOGLE_PLACE_PHOTOS_ENABLED=true`일 때만 일반 Places 사진 API를 사용한다. 기본값은 비활성이며, 비활성 상태에서는 검수된 기존 Places UI Kit 카드가 유지된다. 운영 API 키 허용 목록과 사진·상세 요청 쿼터는 별도로 확인해야 한다. 이 변경만으로 과금 API나 일일 한도가 변경되지는 않는다.

## 사진 선택과 보관

- 기존 실사진이 있으면 이를 우선한다.
- 실사진이 없는 검수된 장소는 상세 갤러리와 메인·인기장소·검색·위시리스트 카드에서 같은 첫 Google 사진을 사용한다. 목록에서는 제목과 좌표로 검수된 장소를 확인하며, 상세 조회를 추가 호출하지 않는다.
- Google 사진은 기존 검수 목록의 장소 ID를 사용하며 신원이 다른 응답은 폐기한다.
- `Place.fetchFields({ fields: ['id', 'photos'] })`로 현재 사진을 가져온다. 배열 순서를 유지하고 첫 번째 유효한 사진을 대표로 사용한다.
- 사진당 `getURI({ maxWidth: 1200 })`를 한 번 호출한다. 대표사진과 작은 썸네일은 같은 URL을 사용한다.
- 사진 URL·사진 데이터는 DB, 정적 assets, localStorage, 영속 캐시에 저장하지 않는다. 화면이 사용하는 현재 응답만 메모리에 둔다.
- 사진을 표시할 때 Google Maps와 촬영자 출처를 함께 표시한다. 이미지 로딩 실패 후 대체 사진이 표시되면 잘못된 Google 촬영자 출처를 제거한다.
- 인증·네트워크·쿼터 오류와 빈 사진 목록에서는 기존 실제/유사 이미지 대체 처리를 유지한다.

## 운영 활성화

2026-09-21 확인 시 운영 브라우저 키는 Maps JavaScript API와 Places UI Kit API만 허용하며, 일반 Places의 `GetPlaceRequest`와 `GetPhotoMediaRequest` 일일 쿼터는 0이다. API 전환은 이 설정을 명시적으로 변경한 다음 활성화해야 한다.

첫 사진과 다른 사진 썸네일 모두 실제 사진 요청에 해당할 수 있다. 사용량 한도는 장소 방문 횟수가 아닌 **사진 요청 수**로 정한다. 일반 Places 사진과 Kakao 지도를 직접 함께 보여주는 코스 지도·장소 검색 모달에는 이 기능을 연결하지 않는다.

공식 문서:

- [사진 API와 촬영자 출처](https://developers.google.com/maps/documentation/javascript/place-photos)
- [필드별 과금 등급](https://developers.google.com/maps/documentation/javascript/place-class-data-fields)
- [가격표](https://developers.google.com/maps/billing-and-pricing/pricing)
- [서비스별 이용 조건](https://cloud.google.com/maps-platform/terms/maps-service-terms)
