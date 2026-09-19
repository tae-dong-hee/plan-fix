-- One reset token and persistent session version per account. Raw tokens are never stored.
BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    user_id BIGINT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE,
    requested_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    session_version BIGINT NOT NULL DEFAULT 0
);

COMMIT;
