-- 검수한 실제 장소 사진만 연결한다. 이름 유사도나 근거리만으로 자동 매칭하지 않는다.
-- 원본 TourAPI 레코드/갤러리를 바꾸지 않으며, 서비스 대표사진만 채운다.
-- 실행 전 대상 spots와 원본 tour_data_spots/tour_data_images를 백업한다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';
LOCK TABLE spots, tour_data_spots, tour_data_images IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE verified_photos (
 spot_id bigint PRIMARY KEY, contentid bigint, title text, address text,
 latitude numeric, longitude numeric, url text, source_id bigint, source_contentid bigint,
 source_title text, source_address text, source_latitude numeric, source_longitude numeric
) ON COMMIT DROP;
INSERT INTO verified_photos VALUES
    (469, 3542992, 'BTS 버스정류장', '강원특별자치도 강릉시 주문진읍 주문북로 222-30', 37.911392, 128.8178558, 'https://tong.visitkorea.or.kr/cms/resource/90/3383890_image2_1.JPG', 561, 2638566, '주문진읍 BTS 앨범사진 촬영지 (버스정류장)', '강원특별자치도 강릉시 주문진읍 향호리', 37.9125457, 128.8170523),
    (526, 3532370, '임당동 성당', '강원특별자치도 강릉시 임영로 148 (임당동)', 37.7544433, 128.8920643, 'https://planfix.cloud/images/verified-spots/526.jpg', NULL, NULL, NULL, NULL, NULL, NULL),
    (528, 3532463, '굴산사지당간지주', '강원특별자치도 강릉시 구정면 금평로 92-50', 37.7079986, 128.8875745, 'https://planfix.cloud/images/verified-spots/528.jpg', NULL, NULL, NULL, NULL, NULL, NULL),
    (706, 3547649, '경포비치호텔', '강원특별자치도 강릉시 해안로406번길 17 (강문동)', 37.7990608, 128.9136387, 'https://tong.visitkorea.or.kr/cms/resource/21/1584021_image2_1.jpg', 689, 142816, '경포 비치 관광 호텔', '강원특별자치도 강릉시 해안로406번길 17', 37.7990246, 128.913686),
    (796, 3536362, '루소호텔', '강원특별자치도 강릉시 교동광장로100번길 12 (교동)', 37.7659694, 128.8764709, 'https://tong.visitkorea.or.kr/cms/resource/73/2581973_image2_1.jpg', 678, 2490115, '루소호텔', '강원특별자치도 강릉시 교동광장로100번길 12', 37.7658697, 128.8763868),
    (923, 3540644, '삼성스토어 강릉옥천점 (구 삼성전자서비스 강릉센터)', '강원특별자치도 강릉시 율곡로 2849 (옥천동)', 37.7581263, 128.8965971, 'https://tong.visitkorea.or.kr/cms/resource/21/4024721_image2_1.jpeg', 900, 4010291, '삼성스토어 강릉옥천', '강원특별자치도 강릉시 율곡로 2849 (옥천동)', 37.7580723, 128.8965708),
    (1057, 3535266, '고씨네 동해막국수 강문본점', '강원특별자치도 강릉시 창해로350번길 25 (강문동)', 37.7963861, 128.9172913, 'https://tong.visitkorea.or.kr/cms/resource/77/3468977_image2_1.jpg', 986, 3468980, '고씨네동해막국수&순두부칼국수 본점', '강원특별자치도 강릉시 창해로350번길 25 (강문동)', 37.7963309, 128.9172649),
    (1112, 3537624, '도깨비젤라또', '강원특별자치도 강릉시 주문진읍 해안로 1605', 37.8795082, 128.8337851, 'https://tong.visitkorea.or.kr/cms/resource/41/3586741_image2_1.jpg', 948, 2820641, '도깨비젤라또', '강원특별자치도 강릉시 주문진읍 해안로 1605', 37.8794734, 128.8337278),
    (1137, 3536882, '보헤미안커피 본점', '강원특별자치도 강릉시 연곡면 홍질목길 55-11', 37.8646712, 128.8424431, 'https://tong.visitkorea.or.kr/cms/resource/98/2892098_image2_1.jpg', 1007, 2892102, '보헤미안박이추커피 본점', '강원특별자치도 강릉시 홍질목길 55-11', 37.8646153, 128.8424148),
    (1224, 3535825, '원인숙고성생선찜', '강원특별자치도 강릉시 성덕포남로 56 (입암동)', 37.7601515, 128.9191644, 'https://tong.visitkorea.or.kr/cms/resource/42/2871142_image2_1.jpg', 1415, 2871151, '고성생선찜', '강원특별자치도 강릉시 성덕포남로 56', 37.7601515, 128.9191644),
    (1340, 3532862, '카페툇마루', '강원특별자치도 강릉시 난설헌로 232 (초당동)', 37.7929448, 128.9145027, 'https://tong.visitkorea.or.kr/cms/resource/03/2844103_image2_1.jpeg', 1376, 2844107, '툇마루', '강원특별자치도 강릉시 난설헌로 232', 37.7929448, 128.9145027),
    (3618, 2680940, '다래', '강원특별자치도 평창군 봉평면 태기로 120', 37.5860724, 128.3237347, 'https://tong.visitkorea.or.kr/cms/resource/57/2789757_image2_1.jpg', 3678, 2789764, '평창한우다래', '강원특별자치도 평창군 봉평면 태기로 120', 37.5861268, 128.3237595),
    (4945, 3434330, '등불가든', '강원특별자치도 양양군 양양읍 포월나들길 23', 38.1037421, 128.6306493, 'https://tong.visitkorea.or.kr/cms/resource/82/3071582_image2_1.jpg', 4932, 134091, '등불가든', '강원특별자치도 양양군 양양읍 포월나들길 23', 38.1036449, 128.6304049);
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM verified_photos v LEFT JOIN spots s ON s.spot_id=v.spot_id
   LEFT JOIN tour_data_spots t ON t.spot_id=s.spot_id
   WHERE s.spot_id IS NULL OR s.status <> 'ACTIVE' OR s.source_type <> 'TOUR_API'
     OR s.title IS DISTINCT FROM v.title OR s.address IS DISTINCT FROM v.address
     OR s.latitude IS DISTINCT FROM v.latitude OR s.longitude IS DISTINCT FROM v.longitude
     OR t.contentid IS DISTINCT FROM v.contentid
     OR (nullif(btrim(s.thumbnail),'') IS NOT NULL AND s.thumbnail <> v.url)
     OR (s.thumbnail IS DISTINCT FROM v.url AND EXISTS (
       SELECT 1 FROM tour_data_images i WHERE i.tour_data_spot_id=t.tour_data_spot_id
         AND (nullif(btrim(i.original_image),'') IS NOT NULL OR nullif(btrim(i.small_image),'') IS NOT NULL)
     ))
 ) THEN RAISE EXCEPTION 'Target identity or missing-photo state changed; inspect before applying'; END IF;
 IF EXISTS (
   SELECT 1 FROM verified_photos v LEFT JOIN spots s ON s.spot_id=v.source_id
   LEFT JOIN tour_data_spots t ON t.spot_id=s.spot_id
   WHERE v.source_id IS NOT NULL AND (
     s.spot_id IS NULL OR s.status <> 'ACTIVE' OR s.source_type <> 'TOUR_API'
     OR t.contentid IS DISTINCT FROM v.source_contentid
     OR s.title IS DISTINCT FROM v.source_title OR s.address IS DISTINCT FROM v.source_address
     OR s.latitude IS DISTINCT FROM v.source_latitude OR s.longitude IS DISTINCT FROM v.source_longitude
     OR NOT (replace(coalesce(s.thumbnail,''),'http://','https://')=v.url OR EXISTS (
       SELECT 1 FROM tour_data_images i WHERE i.tour_data_spot_id=t.tour_data_spot_id
         AND (replace(coalesce(i.original_image,''),'http://','https://')=v.url
           OR replace(coalesce(i.small_image,''),'http://','https://')=v.url)
     ))
   )
 ) THEN RAISE EXCEPTION 'Source identity or original image changed; inspect before applying'; END IF;
END $$;
UPDATE spots s SET thumbnail=v.url, updated_at=now()
FROM verified_photos v WHERE s.spot_id=v.spot_id AND s.thumbnail IS DISTINCT FROM v.url;
COMMIT;
