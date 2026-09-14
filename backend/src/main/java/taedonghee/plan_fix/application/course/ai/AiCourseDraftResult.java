package taedonghee.plan_fix.application.course.ai;

import taedonghee.plan_fix.domain.spot.SpotModel;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * [application] AI가 짠 코스 초안.
 *
 * 바로 저장하지 않고 코스 생성 화면에 채워 넣는 용도라, 저장에 필요한 spotId뿐
 * 아니라 화면에 그릴 이름·카테고리·좌표까지 함께 담는다.
 */
public record AiCourseDraftResult(
	String title,
	LocalDate startDate,
	LocalDate endDate,
	List<Day> days,
	/** 규칙 기반으로 만들었는지, LLM이 배치했는지. 폴백 여부를 화면에서 알 수 있게 둔다. */
	String generatedBy
) {

	public record Day(int dayNumber, List<Spot> spots) {
	}

	public record Spot(
		Long spotId,
		String title,
		String category,
		String region,
		String sigungu,
		String address,
		String thumbnail,
		BigDecimal latitude,
		BigDecimal longitude,
		/** 왜 이 장소를 골랐는지. 규칙 기반일 땐 간단한 근거, LLM일 땐 생성된 설명이 들어간다. */
		String reason
	) {
		public static Spot from(SpotModel spot, String reason) {
			return from(spot, reason, spot.thumbnail());
		}

		public static Spot from(SpotModel spot, String reason, String thumbnail) {
			return new Spot(
				spot.spotId(),
				spot.title(),
				spot.category(),
				spot.region(),
				spot.sigungu(),
				spot.address(),
				thumbnail,
				spot.latitude(),
				spot.longitude(),
				reason
			);
		}
	}
}
