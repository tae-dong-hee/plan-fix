# 기본 대표사진 20장 추가 검수 기록

2026-09-13. 기존 사진 20장에 새 사진 20장을 추가하여 S3에 총 40장이 있습니다. 새 파일 합계는 5,790,007바이트(약 5.8MB)입니다.

- 추가 S3 경로: `defaults/course-covers/2026-09-v2/`
- 추가 ID: `gangwon-course-cover-22`부터 `gangwon-course-cover-41`
- 기존 20개 오브젝트의 키·크기·ETag와 기존 카탈로그 항목 유지 확인
- 새 20개 오브젝트 모두 S3 재다운로드 후 SHA-256·크기·JPEG Content-Type 일치 확인
- 프론트/백엔드 카탈로그 40개 항목 완전 일치

## 검수와 역검수

1. 사진 53개를 실제로 열어 구도·노출·테마 적합성과 4:3 카드 크롭을 검수했습니다.
2. 최종 후보를 큰 4:3 미리보기로 다시 보며 파일에서 출처·제목·테마로 거슬러 대조했습니다. 매표소를 찍은 리조트 사진, 간판 위주의 카페, 유사한 설경, 조리 전 닭갈비, 부적합한 지역 설명을 제외하거나 교체했습니다.
3. 최종 원본의 Commons 리비전, 원본 SHA-1, 저작자, 라이선스, 제한 사항, 설명을 다시 조회했습니다. 기록은 `course-cover-sources.json`에 보존했습니다.
4. 기존 20장과 최종 20장 모두 SHA-256이 다릅니다. 지각 해시(dHash)로 590개 비교 쌍을 점검하고 유사도가 높은 쌍을 시각적으로 재확인했습니다. 자동 비교만으로 장면 중복을 판정하지 않았습니다.
5. 원본 변경 없이 제공되는 1280px JPEG를 저장하고 업로드한 바이트를 다시 내려받아 검수 파일과 대조했습니다.

범용 테마 사진은 해외 촬영 사진도 포함합니다. 지역을 알 수 없거나 강원도 방문지 사진이 아닌 경우 `regions: []`로 등록하고, 사진 출처 화면에 범용 테마 이미지임을 안내합니다.

## 추가 목록

| ID | 분류 | 제목 | 라이선스 | 원본 |
|---|---|---|---|---|
| 22 | 숙소·캠핑 | 숙소 테마 · 포근한 호텔 객실 | CC0 | [출처](https://commons.wikimedia.org/wiki/File:Bed_in_hotel_room_2.jpg) |
| 23 | 숙소·캠핑 | 숙소 테마 · 따뜻한 목조 펜션 실내 | CC BY 2.0 | [출처](https://commons.wikimedia.org/wiki/File:Cozy_wooden_cabin_interior_with_seating_area_and_bedroom_space.jpg) |
| 24 | 숙소·캠핑 | 숙소 테마 · 햇살 아래 글램핑 텐트 | CC BY 4.0 | [출처](https://commons.wikimedia.org/wiki/File:Glamping_Thorbjornrud_Hotel.jpg) |
| 25 | 숙소·캠핑 | 캠핑 테마 · 잔잔한 물가의 텐트 | CC BY-SA 4.0 | [출처](https://commons.wikimedia.org/wiki/File:Tent_camping.jpg) |
| 26 | 겨울 풍경 | 겨울 테마 · 눈 덮인 숲길 | Public domain | [출처](https://commons.wikimedia.org/wiki/File:Forest_road_Slavne_2017_G8.jpg) |
| 27 | 겨울 풍경 | 겨울 테마 · 가지에 맺힌 하얀 서리 | CC BY-SA 4.0 | [출처](https://commons.wikimedia.org/wiki/File:Hoar_frost_on_bare_tree_branches_at_Myrstigen_4.jpg) |
| 28 | 겨울 풍경 | 강원 겨울 아침의 햇살 | CC BY-SA 3.0 | [출처](https://commons.wikimedia.org/wiki/File:Gangwon_Do_South_Korea_(131397671).jpeg) |
| 29 | 바다 | 속초 바위 해안의 일출 | CC BY 3.0 | [출처](https://commons.wikimedia.org/wiki/File:%EC%86%8D%EC%B4%88_16%EB%85%84_%EC%9D%BC%EC%B6%9C_-_panoramio.jpg) |
| 30 | 바다 | 동해 추암촛대바위 일출 | KOGL Type 1 | [출처](https://commons.wikimedia.org/wiki/File:%EC%B6%94%EC%95%94%EC%B4%9B%EB%8C%80%EB%B0%94%EC%9C%84_2.jpg) |
| 31 | 액티비티 | 평창 알펜시아 야간 스키장 | CC BY-SA 4.0 | [출처](https://commons.wikimedia.org/wiki/File:Alpensia.jpg) |
| 32 | 액티비티 | 액티비티 테마 · 파도를 타는 서퍼 | CC BY-SA 2.0 | [출처](https://commons.wikimedia.org/wiki/File:Surfing_in_Popoyo,_Nicaragua.jpg) |
| 33 | 액티비티 | 액티비티 테마 · 급류 래프팅 | CC0 | [출처](https://commons.wikimedia.org/wiki/File:Rafting,_F%C4%B1rt%C4%B1na_Deresi,_Rize_2014.jpg) |
| 34 | 액티비티 | 액티비티 테마 · 고요한 호수 카누 | CC BY-SA 4.0 | [출처](https://commons.wikimedia.org/wiki/File:Sunset_Canoe_Ride_in_Lake_Mert.jpg) |
| 35 | 액티비티 | 액티비티 테마 · 푸른 하늘 패러글라이딩 | CC BY 4.0 | [출처](https://commons.wikimedia.org/wiki/File:Paragliding_in_Arambol_sky,_Goa.jpg) |
| 36 | 카페·디저트 | 강릉 찻집의 유리 다관 | CC0 | [출처](https://commons.wikimedia.org/wiki/File:20151003%EC%B5%9C%EA%B4%91%EB%AA%A8RX10DSC03041.JPG) |
| 37 | 카페·디저트 | 카페 테마 · 라테아트 커피 한 잔 | CC BY 4.0 | [출처](https://commons.wikimedia.org/wiki/File:A_cup_of_cappuccino.jpg) |
| 38 | 카페·디저트 | 카페 테마 · 커피와 초콜릿 디저트 | CC BY-SA 4.0 | [출처](https://commons.wikimedia.org/wiki/File:Cappuccino_and_cookie.jpg) |
| 39 | 음식 | 맛집 테마 · 닭갈비 한 접시 | CC0 | [출처](https://commons.wikimedia.org/wiki/File:Chuncheon_sizzling_chicken_(Dakgalbi).jpg) |
| 40 | 음식 | 강릉 들깨 막국수 한 상 | CC BY-SA 4.0 | [출처](https://commons.wikimedia.org/wiki/File:Deulkkae_makguksu_20220501_001.jpg) |
| 41 | 문화 | 양양 낙산사의 전통 단청 | CC0 | [출처](https://commons.wikimedia.org/wiki/File:Bell_Pavilion_at_Naksansa_02.jpg) |

## 앱 연결과 검증

백엔드 관련 테스트 32개, 프론트 이미지 경로 테스트 4개, TypeScript 타입 검사와 `git diff --check`를 통과했습니다.

새 테마 사진이 자동 선택될 수 있도록 숙소·겨울 테마 사전과 범용 사진 후보 처리를 추가했습니다. 직접 지정한 대표사진을 우선하고, 관련 내용이 없을 때는 기존 지역 후보를 사용합니다. 이미지 API의 등록 상한은 40장이며 새 사진의 캐시 버전은 S3 키에서 읽습니다.

S3 업로드는 완료했습니다. 새 카탈로그를 운영 화면에서 사용하려면 이 변경의 프론트·백엔드 배포가 필요합니다. 운영 배포는 이번 작업에서 실행하지 않았습니다.

동해 추암 사진의 제1유형 조건은 [공공누리 원 제공기관 기록](https://www.kogl.or.kr/recommend/recommendDivView.do?recommendIdx=84009&division=img)에서도 별도로 확인했습니다.
