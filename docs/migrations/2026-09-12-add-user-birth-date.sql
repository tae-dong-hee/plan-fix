-- 회원가입 시 입력한 생년월일 저장
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS birth_date DATE;
