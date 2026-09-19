package taedonghee.plan_fix.domain.spot;

import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.OffsetDateTime;

/**
 * [domain] 관광 데이터 스팟(TourDataSpotModel)의 상세 정보(detailIntro2/detailInfo2 결과).
 * 하나의 TourDataSpotModel당 하나 (tourDataSpotId로 참조).
 *
 * detailIntro2는 contentTypeId(category)마다 응답 필드명이 전부 달라서(예: 관광지=usetime, 음식점=opentimefood),
 * 여기서는 타입과 무관한 공통 의미의 컬럼(tel/parkInfo/timeInfo/restInfo)으로 정규화해서 담는다.
 * firstMenu/treatMenu/lcnsno는 음식점(39)에만 있는 값이다.
 * JPA 등 프레임워크 의존 없이, 비즈니스 규칙만 표현한다.
 */
public class TourDataInfoModel {

	private final Long tourDataInfoId;
	private final Long tourDataSpotId;
	private final Long contentId;
	private final OffsetDateTime createdAt;

	private String category;
	private String firstMenu;
	private String treatMenu;
	private String tel;
	private String parkInfo;
	private String timeInfo;
	private String restInfo;
	private String lcnsno;
	/** detailInfo2 반복정보. null은 미수집이며 빈 문자열도 정상 수집 결과다. */
	private String additionalInfo;
	private OffsetDateTime updatedAt;

	private TourDataInfoModel(Builder builder) {
		if (builder.tourDataSpotId == null) {
			throw new CoreException(ErrorType.BAD_REQUEST, "tourDataSpotId는 필수입니다.");
		}
		if (builder.contentId == null) {
			throw new CoreException(ErrorType.BAD_REQUEST, "contentId는 필수입니다.");
		}

		this.tourDataInfoId = builder.tourDataInfoId;
		this.tourDataSpotId = builder.tourDataSpotId;
		this.contentId = builder.contentId;
		this.category = builder.category;
		this.firstMenu = builder.firstMenu;
		this.treatMenu = builder.treatMenu;
		this.tel = builder.tel;
		this.parkInfo = builder.parkInfo;
		this.timeInfo = builder.timeInfo;
		this.restInfo = builder.restInfo;
		this.lcnsno = builder.lcnsno;
		this.additionalInfo = builder.additionalInfo;
		this.createdAt = builder.createdAt;
		this.updatedAt = builder.updatedAt;
	}

	public static Builder builder() {
		return new Builder();
	}

	/** detailIntro2 재수집 결과로 속성을 갱신한다 (tourDataSpotId, contentId, createdAt은 불변) */
	public void updateFromTourApi(String category, String firstMenu, String treatMenu, String tel,
		String parkInfo, String timeInfo, String restInfo, String lcnsno) {
		this.category = category;
		this.firstMenu = firstMenu;
		this.treatMenu = treatMenu;
		this.tel = tel;
		this.parkInfo = parkInfo;
		this.timeInfo = timeInfo;
		this.restInfo = restInfo;
		this.lcnsno = lcnsno;
		this.updatedAt = OffsetDateTime.now();
	}

	public Long tourDataInfoId() { return tourDataInfoId; }
	public Long tourDataSpotId() { return tourDataSpotId; }
	public Long contentId() { return contentId; }
	public String category() { return category; }
	public String firstMenu() { return firstMenu; }
	public String treatMenu() { return treatMenu; }
	public String tel() { return tel; }
	public String parkInfo() { return parkInfo; }
	public String timeInfo() { return timeInfo; }
	public String restInfo() { return restInfo; }
	public String lcnsno() { return lcnsno; }
	public String additionalInfo() { return additionalInfo; }
	public OffsetDateTime createdAt() { return createdAt; }
	public OffsetDateTime updatedAt() { return updatedAt; }

	/**
	 * [domain] TourDataInfoModel 빌더.
	 * 신규 생성(createdAt/updatedAt 미지정 시 현재 시각)과, infrastructure의 영속 데이터 복원(모든 필드 지정)
	 * 두 경우 모두 이 빌더 하나로 처리한다.
	 */
	public static class Builder {
		private Long tourDataInfoId;
		private Long tourDataSpotId;
		private Long contentId;
		private String category;
		private String firstMenu;
		private String treatMenu;
		private String tel;
		private String parkInfo;
		private String timeInfo;
		private String restInfo;
		private String lcnsno;
		private String additionalInfo;
		private OffsetDateTime createdAt = OffsetDateTime.now();
		private OffsetDateTime updatedAt = OffsetDateTime.now();

		private Builder() {
		}

		public Builder tourDataInfoId(Long tourDataInfoId) { this.tourDataInfoId = tourDataInfoId; return this; }
		public Builder tourDataSpotId(Long tourDataSpotId) { this.tourDataSpotId = tourDataSpotId; return this; }
		public Builder contentId(Long contentId) { this.contentId = contentId; return this; }
		public Builder category(String category) { this.category = category; return this; }
		public Builder firstMenu(String firstMenu) { this.firstMenu = firstMenu; return this; }
		public Builder treatMenu(String treatMenu) { this.treatMenu = treatMenu; return this; }
		public Builder tel(String tel) { this.tel = tel; return this; }
		public Builder parkInfo(String parkInfo) { this.parkInfo = parkInfo; return this; }
		public Builder timeInfo(String timeInfo) { this.timeInfo = timeInfo; return this; }
		public Builder restInfo(String restInfo) { this.restInfo = restInfo; return this; }
		public Builder lcnsno(String lcnsno) { this.lcnsno = lcnsno; return this; }
		public Builder additionalInfo(String additionalInfo) { this.additionalInfo = additionalInfo; return this; }
		public Builder createdAt(OffsetDateTime createdAt) { this.createdAt = createdAt; return this; }
		public Builder updatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; return this; }

		public TourDataInfoModel build() {
			return new TourDataInfoModel(this);
		}
	}
}
