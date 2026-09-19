-- AI가 일차마다 배정한 여행 제안과 기본 취향을 장소 목록과 독립적으로 보존한다.
-- 기존 코스는 null로 남기며, 새 코스는 장소가 없는 일차까지 JSON에 기록한다.
BEGIN;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS day_themes TEXT;

COMMENT ON COLUMN courses.day_themes IS 'JSON array of {dayNumber,themes,tripIdeas}; null means legacy/no recorded day themes';

COMMIT;
