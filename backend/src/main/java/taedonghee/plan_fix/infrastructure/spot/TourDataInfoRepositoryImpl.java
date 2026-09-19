package taedonghee.plan_fix.infrastructure.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.TourDataInfoModel;
import taedonghee.plan_fix.domain.spot.TourDataInfoRepository;

import java.util.Optional;

/**
 * [infrastructure] domain.TourDataInfoRepository 포트의 JPA 구현체(어댑터).
 * domain <- infrastructure: domain의 인터페이스를 구현하며, JPA 엔티티 <-> domain 모델 변환을 책임진다.
 */
@Repository
@RequiredArgsConstructor
public class TourDataInfoRepositoryImpl implements TourDataInfoRepository {

	private final TourDataInfoJpaRepository tourDataInfoJpaRepository;

	@Override
	@Transactional
	public TourDataInfoModel save(TourDataInfoModel info) {
		// 기본정보와 추가정보 수집이 동시에 처음 저장하더라도 contentid 중복/덮어쓰기를 피한다.
		tourDataInfoJpaRepository.upsertIntro(toEntity(info));
		return findByContentId(info.contentId()).orElseThrow();
	}

	@Override
	@Transactional
	public boolean fillAdditionalInfoIfMissing(Long tourDataSpotId, String additionalInfo) {
		return tourDataInfoJpaRepository.fillAdditionalInfoIfMissing(tourDataSpotId, additionalInfo) > 0;
	}

	@Override
	public Optional<TourDataInfoModel> findByContentId(Long contentId) {
		return tourDataInfoJpaRepository.findByContentId(contentId).map(this::toDomain);
	}

	@Override
	public long countAll() {
		return tourDataInfoJpaRepository.count();
	}

	private TourDataInfoJpaEntity toEntity(TourDataInfoModel model) {
		return TourDataInfoJpaEntity.builder()
			.tourDataInfoId(model.tourDataInfoId())
			.tourDataSpotId(model.tourDataSpotId())
			.contentId(model.contentId())
			.category(model.category())
			.firstMenu(model.firstMenu())
			.treatMenu(model.treatMenu())
			.tel(model.tel())
			.parkInfo(model.parkInfo())
			.timeInfo(model.timeInfo())
			.restInfo(model.restInfo())
			.lcnsno(model.lcnsno())
			.additionalInfo(model.additionalInfo())
			.createdAt(model.createdAt())
			.updatedAt(model.updatedAt())
			.build();
	}

	private TourDataInfoModel toDomain(TourDataInfoJpaEntity entity) {
		return TourDataInfoModel.builder()
			.tourDataInfoId(entity.getTourDataInfoId())
			.tourDataSpotId(entity.getTourDataSpotId())
			.contentId(entity.getContentId())
			.category(entity.getCategory())
			.firstMenu(entity.getFirstMenu())
			.treatMenu(entity.getTreatMenu())
			.tel(entity.getTel())
			.parkInfo(entity.getParkInfo())
			.timeInfo(entity.getTimeInfo())
			.restInfo(entity.getRestInfo())
			.lcnsno(entity.getLcnsno())
			.additionalInfo(entity.getAdditionalInfo())
			.createdAt(entity.getCreatedAt())
			.updatedAt(entity.getUpdatedAt())
			.build();
	}
}
