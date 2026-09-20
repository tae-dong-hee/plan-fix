CREATE TABLE IF NOT EXISTS course_invite_kakao_shares (
    course_invite_id BIGINT NOT NULL REFERENCES course_invites(course_invite_id) ON DELETE CASCADE,
    share_request_id UUID NOT NULL,
    UNIQUE (course_invite_id, share_request_id)
);
