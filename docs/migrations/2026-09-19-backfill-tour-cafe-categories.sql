-- 기존 수집 장소에도 TourCategory.displayNameOf(contentTypeId, lcls) 카페 분류를 반영한다.
-- 이름/주소를 추정하지 않고 TourAPI 원본의 음식점(39) + 카페/음료(FD05*)만 사용한다.
-- 적용 전 후보 spots와 연결된 tour_data_spots를 백업한다.
-- category 이외의 필드와 사용자 연결은 보존한다. HIDDEN도 보정하되 공개하지 않는다.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '20s';

-- 후보 확인과 UPDATE 사이에 수집기가 원본/분류를 변경하지 못하게 한다.
-- 공개 목록의 일반 SELECT는 계속 가능하다.
LOCK TABLE spots, tour_data_spots IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE tour_cafe_category_candidates ON COMMIT DROP AS
SELECT s.spot_id
FROM spots s
WHERE s.source_type = 'TOUR_API'
  AND s.category = '음식점'
  AND EXISTS (
      SELECT 1 FROM tour_data_spots t
      WHERE t.spot_id = s.spot_id
        AND t.category = '39'
        AND t.lcls LIKE 'FD05%'
  );

-- contentid는 유일하지만 spot_id에는 유일 제약이 없다. 여러 원본이 연결된 장소는
-- 어느 원본을 따라야 할지 추정하지 않고 전체 트랜잭션을 중단한다.
DO $$
BEGIN
    IF EXISTS (
        SELECT c.spot_id
        FROM tour_cafe_category_candidates c
        JOIN tour_data_spots t ON t.spot_id = c.spot_id
        GROUP BY c.spot_id
        HAVING count(*) <> 1
    ) THEN
        RAISE EXCEPTION 'Cafe category candidate has multiple TourAPI source rows; inspect before applying';
    END IF;
END $$;

WITH corrected AS (
    UPDATE spots s
    SET category = '카페/음료'
    FROM tour_cafe_category_candidates c
    WHERE s.spot_id = c.spot_id
    RETURNING s.status
)
SELECT status, count(*) AS corrected_spots
FROM corrected
GROUP BY status
ORDER BY status;

COMMIT;
