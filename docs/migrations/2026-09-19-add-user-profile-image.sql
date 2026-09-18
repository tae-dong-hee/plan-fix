-- Apply before deploying profile-photo code. The application stores photos in private S3.
-- Required S3 permissions for users/*/profile/*: s3:PutObject, s3:GetObject, s3:DeleteObject.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_key VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_avatar_color VARCHAR(10);
-- Older app instances may still sign users up during a rolling deployment.
ALTER TABLE users ALTER COLUMN default_avatar_color
    SET DEFAULT (ARRAY['violet', 'blue', 'green', 'amber', 'rose'])[floor(random() * 5)::int + 1];

-- Assign each existing user one random color once; rerunning leaves assignments intact.
UPDATE users
SET default_avatar_color = (ARRAY['violet', 'blue', 'green', 'amber', 'rose'])[floor(random() * 5)::int + 1]
WHERE default_avatar_color IS NULL;
ALTER TABLE users ALTER COLUMN default_avatar_color SET NOT NULL;
COMMIT;
