-- 기존 게시글의 댓글 수를 활성 댓글 기준으로 보정
UPDATE boards b
SET comment_count = (
    SELECT COUNT(*)
    FROM comments c
    WHERE c.board_id = b.board_id
      AND c.status = 'ACTIVE'
);
