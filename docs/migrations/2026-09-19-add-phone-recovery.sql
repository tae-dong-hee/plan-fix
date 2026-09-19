-- No existing user is linked to a phone without a new successful OTP verification.
BEGIN;

CREATE TABLE IF NOT EXISTS user_recovery_phones (
    user_id BIGINT PRIMARY KEY REFERENCES users(user_id),
    phone_number VARCHAR(11) NOT NULL UNIQUE,
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS phone_verification_challenges (
    id VARCHAR(43) PRIMARY KEY,
    purpose VARCHAR(20) NOT NULL,
    phone_number VARCHAR(11) NOT NULL,
    user_id BIGINT REFERENCES users(user_id),
    code_hash VARCHAR(64) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    consumed BOOLEAN NOT NULL DEFAULT FALSE,
    receipt_hash VARCHAR(64) UNIQUE,
    receipt_expires_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_phone_challenge_phone ON phone_verification_challenges(phone_number);

-- HMAC keys keep requester IP addresses and destination numbers out of rate-limit rows.
CREATE TABLE IF NOT EXISTS phone_verification_rate_limits (
    bucket_key VARCHAR(64) PRIMARY KEY,
    window_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_requested_at TIMESTAMP WITH TIME ZONE,
    request_count INTEGER NOT NULL DEFAULT 0
);

COMMIT;

-- Run as a periodic maintenance job; never remove active rate windows or signup receipts.
-- DELETE FROM phone_verification_challenges WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
-- DELETE FROM phone_verification_rate_limits WHERE window_started_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
