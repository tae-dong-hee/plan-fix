-- 2026-09-19 확인된 TourDataSpotCollectApplicationServiceTest 잔여 데이터 보정.
-- 이름만으로 중복을 판단하지 않는다. 감사에서 확인한 ID/contentid와 fixture 속성을 모두 대조한다.
-- 실행 전 spots/tour_data_spots, 연결된 course_spots/spot_likes를 백업한다.
-- 가짜 경포해수욕장의 코스·좋아요는 실제 TourAPI 장소(128758)로 연결한다.
-- 원본 행/좋아요는 삭제하지 않고 HIDDEN으로 보존한다. 재실행은 변경 없이 끝난다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';

-- 좋아요 수 계산과 코스 이동 도중 동시 쓰기가 끼어들지 않도록 잠깐 잠근다.
-- 일반 공개 목록 SELECT는 계속 가능하다.
LOCK TABLE spots, tour_data_spots, course_spots, spot_likes IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE leaked_gangneung_spots ON COMMIT DROP AS
SELECT s.spot_id, s.title, s.view_count
FROM spots s
JOIN tour_data_spots t ON t.spot_id = s.spot_id
JOIN (VALUES
    (4947::bigint, 482070592765625::bigint, '원래 제목', 'NATIVE', 'TourAPI가 덮어쓴 제목'),
    (4949, 482071703662958, '경포해수욕장', 'TOUR_API', '경포해수욕장'),
    (4984, 18176347203666, '원래 제목', 'NATIVE', 'TourAPI가 덮어쓴 제목'),
    (4986, 18177748176416, '경포해수욕장', 'TOUR_API', '경포해수욕장'),
    (5021, 23552350347875, '원래 제목', 'NATIVE', 'TourAPI가 덮어쓴 제목'),
    (5023, 23554870927500, '경포해수욕장', 'TOUR_API', '경포해수욕장')
) expected(spot_id, contentid, title, source_type, source_title)
  ON s.spot_id = expected.spot_id AND t.contentid = expected.contentid
WHERE s.status = 'ACTIVE'
  AND s.title = expected.title AND s.source_type = expected.source_type
  AND t.title = expected.source_title
  AND s.region = '51' AND s.sigungu = '150'
  AND s.category = '관광지' AND s.address = '강원특별자치도 강릉시'
  AND s.thumbnail = 'thumb.jpg'
  AND s.latitude = 37.8127061 AND s.longitude = 128.8987999
  AND t.reg = '51' AND t.sigungu = '150' AND t.category = '12'
  AND t.address = s.address AND t.thumbnail = 'thumb.jpg'
  AND t.mapy = 37.8127061 AND t.mapx = 128.8987999
  AND t.createdtime = '20240101000000' AND t.zipcode = '25400' AND t.lcls = 'AC01';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM leaked_gangneung_spots) THEN
        IF EXISTS (SELECT 1 FROM spots WHERE spot_id IN (4947,4949,4984,4986,5021,5023))
           AND (SELECT count(*) FROM spots WHERE spot_id IN (4947,4949,4984,4986,5021,5023) AND status = 'HIDDEN') <> 6 THEN
            RAISE EXCEPTION 'Fixture rows still exist but no longer match the audit';
        END IF;
        RETURN;
    END IF;
    IF (SELECT count(*) FROM leaked_gangneung_spots) <> 6 THEN
        RAISE EXCEPTION 'Fixture snapshot differs from audit; inspect before applying';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM spots s JOIN tour_data_spots t ON t.spot_id = s.spot_id
        WHERE s.spot_id = 429 AND t.contentid = 128758
          AND s.title = '경포해수욕장' AND s.source_type = 'TOUR_API' AND s.status = 'ACTIVE'
          AND s.region = '51' AND s.sigungu = '150'
          AND s.address = '강원특별자치도 강릉시 창해로 514 (안현동)'
    ) THEN
        RAISE EXCEPTION 'Canonical Gyeongpo beach differs from audit';
    END IF;
    -- '원래 제목'에는 대응하는 실제 장소가 없다. 새 사용자 연결이 생겼다면 자동 보정하지 않는다.
    IF EXISTS (
        SELECT 1 FROM leaked_gangneung_spots f
        WHERE f.title = '원래 제목' AND (
            EXISTS (SELECT 1 FROM course_spots c WHERE c.spot_id = f.spot_id)
            OR EXISTS (SELECT 1 FROM spot_likes l WHERE l.spot_id = f.spot_id)
        )
    ) THEN
        RAISE EXCEPTION 'Placeholder has user references; inspect before applying';
    END IF;
END $$;

-- 같은 사용자가 여러 가짜 항목을 좋아했어도 정상 장소의 좋아요는 한 건으로 보존한다.
INSERT INTO spot_likes (user_id, spot_id, created_at)
SELECT l.user_id, 429, min(l.created_at)
FROM spot_likes l JOIN leaked_gangneung_spots f ON f.spot_id = l.spot_id
WHERE f.title = '경포해수욕장'
GROUP BY l.user_id
ON CONFLICT (user_id, spot_id) DO NOTHING;

UPDATE course_spots c SET spot_id = 429
FROM leaked_gangneung_spots f
WHERE c.spot_id = f.spot_id AND f.title = '경포해수욕장';

UPDATE spots SET
    like_count = (SELECT count(*) FROM spot_likes WHERE spot_id = 429),
    view_count = view_count + (SELECT coalesce(sum(view_count), 0) FROM leaked_gangneung_spots WHERE title = '경포해수욕장'),
    updated_at = now()
WHERE spot_id = 429 AND EXISTS (SELECT 1 FROM leaked_gangneung_spots);

UPDATE spots s SET status = 'HIDDEN', updated_at = now()
FROM leaked_gangneung_spots f WHERE s.spot_id = f.spot_id;

COMMIT;
