BEGIN;

-- HMAC keys keep mailboxes, login IDs, and socket peer addresses out of quota rows.
CREATE TABLE IF NOT EXISTS account_recovery_rate_limits (
    bucket_key VARCHAR(64) PRIMARY KEY,
    window_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_requested_at TIMESTAMP WITH TIME ZONE,
    request_count INTEGER NOT NULL DEFAULT 0
);

COMMIT;

-- Optional maintenance: never remove an active hourly window.
-- DELETE FROM account_recovery_rate_limits WHERE window_started_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
