package taedonghee.plan_fix.infrastructure.spot;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;

/**
 * [infrastructure] TourDataInfo의 JPA 매핑 전용 엔티티. domain.spot.TourDataInfoModel과 별개로 둔다.
 * JPA가 요구하는 기본 생성자/PK 전략 같은 영속성 관심사가 domain을 오염시키지 않게 하기 위함.
 */
@Entity
@Table(
	name = "tour_data_info",
	indexes = {
		@Index(name = "idx_tour_data_info_contentid", columnList = "contentid", unique = true),
		@Index(name = "idx_tour_data_info_spot", columnList = "tour_data_spot_id")
	}
)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TourDataInfoJpaEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	@Column(name = "tour_data_info_id")
	private Long tourDataInfoId;

	@Column(name = "tour_data_spot_id", nullable = false)
	private Long tourDataSpotId;

	@Column(name = "contentid", nullable = false)
	private Long contentId;

	@Column(name = "category", length = 20)
	private String category;

	@Column(name = "firstmenu", length = 500)
	private String firstMenu;

	@Column(name = "treatmenu", length = 1000)
	private String treatMenu;

	@Column(name = "tel", length = 200)
	private String tel;

	@Column(name = "park_info", length = 1000)
	private String parkInfo;

	@Column(name = "time_info", length = 1000)
	private String timeInfo;

	@Column(name = "rest_info", length = 500)
	private String restInfo;

	@Column(name = "lcnsno", length = 100)
	private String lcnsno;

	/** detailInfo2 반복정보. null은 미수집, 빈 문자열은 정상 응답에 정보가 없었던 경우다. */
	@Column(name = "additional_info", columnDefinition = "text")
	private String additionalInfo;

	@Column(name = "created_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime createdAt;

	@Column(name = "updated_at", nullable = false, columnDefinition = "timestamptz")
	private OffsetDateTime updatedAt;

	@Builder
	private TourDataInfoJpaEntity(Long tourDataInfoId, Long tourDataSpotId, Long contentId, String category,
		String firstMenu, String treatMenu, String tel, String parkInfo, String timeInfo, String restInfo,
		String lcnsno, String additionalInfo, OffsetDateTime createdAt, OffsetDateTime updatedAt) {
		this.tourDataInfoId = tourDataInfoId;
		this.tourDataSpotId = tourDataSpotId;
		this.contentId = contentId;
		this.category = category;
		this.firstMenu = firstMenu;
		this.treatMenu = treatMenu;
		this.tel = tel;
		this.parkInfo = parkInfo;
		this.timeInfo = timeInfo;
		this.restInfo = restInfo;
		this.lcnsno = lcnsno;
		this.additionalInfo = additionalInfo;
		this.createdAt = createdAt;
		this.updatedAt = updatedAt;
	}
}
