-- 코스를 만든 방식과 사용자가 선택한 테마를 보존한다.
-- 기존 코스는 출처를 알 수 없으므로 null로 유지한다. 제목으로 AI 여부를 추정하지 않는다.
BEGIN;

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS generated_by VARCHAR(20),
    ADD COLUMN IF NOT EXISTS themes VARCHAR(100);

COMMENT ON COLUMN courses.generated_by IS 'LLM, RULE_BASED, MANUAL; null means legacy/unknown';
COMMENT ON COLUMN courses.themes IS 'Selected theme codes in order, comma-separated; null means none recorded';

COMMIT;
