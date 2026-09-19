-- TourAPI detailInfo2 반복정보. NULL은 미수집, 빈 문자열은 정상적으로 조회했으나 정보가 없는 상태다.
ALTER TABLE tour_data_info ADD COLUMN IF NOT EXISTS additional_info TEXT;
