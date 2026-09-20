-- Existing rows deliberately remain NULL. The application establishes a safe baseline
-- under the course lock before creating a new invitation or accepting a legacy link.
ALTER TABLE course_members ADD COLUMN IF NOT EXISTS last_applied_invite_id BIGINT;
