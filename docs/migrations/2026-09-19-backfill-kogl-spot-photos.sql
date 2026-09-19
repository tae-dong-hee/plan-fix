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
    (470, 3531662, '최선평 가옥', '강원특별자치도 강릉시 주문진읍 신리천로 342', 37.8783041, 128.7959595, 'https://planfix.cloud/images/verified-spots/470.jpg', NULL, NULL, NULL, NULL, NULL, NULL),
    (543, 3532451, '보광리석조여래좌상', '강원특별자치도 강릉시 성산면 삼왕길 139-98', 37.7522165, 128.7859934, 'https://planfix.cloud/images/verified-spots/543.jpg', NULL, NULL, NULL, NULL, NULL, NULL),
    (453, 127975, '경포호(철새도래지)', '강원특별자치도 강릉시 저동', 37.7967, 128.9021, 'https://planfix.cloud/images/verified-spots/453.jpg', NULL, NULL, NULL, NULL, NULL, NULL),
    (497, 128759, '강릉 수리골 고택', '강원특별자치도 강릉시 운정길 125', 37.7861536, 128.891107, 'https://planfix.cloud/images/verified-spots/497.jpg', NULL, NULL, NULL, NULL, NULL, NULL);
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
