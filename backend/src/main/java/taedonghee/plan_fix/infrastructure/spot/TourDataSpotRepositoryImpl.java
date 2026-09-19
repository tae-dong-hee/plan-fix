package taedonghee.plan_fix.infrastructure.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import taedonghee.plan_fix.domain.spot.TourDataSpotModel;
import taedonghee.plan_fix.domain.spot.TourDataSpotRepository;

import java.util.List;
import java.util.Optional;

/**
 * [infrastructure] domain.TourDataSpotRepository 포트의 JPA 구현체(어댑터).
 * domain <- infrastructure: domain의 인터페이스를 구현하며, JPA 엔티티 <-> domain 모델 변환을 책임진다.
 */
@Repository
@RequiredArgsConstructor
public class TourDataSpotRepositoryImpl implements TourDataSpotRepository {

	private final TourDataSpotJpaRepository tourDataSpotJpaRepository;

	@Override
	public TourDataSpotModel save(TourDataSpotModel tourDataSpot) {
		TourDataSpotJpaEntity saved = tourDataSpotJpaRepository.save(toEntity(tourDataSpot));
		return toDomain(saved);
	}

	@Override
	public Optional<TourDataSpotModel> findByContentId(Long contentId) {
		return tourDataSpotJpaRepository.findByContentId(contentId).map(this::toDomain);
	}

	@Override
	public Optional<TourDataSpotModel> findBySpotId(Long spotId) {
		return tourDataSpotJpaRepository.findBySpotId(spotId).map(this::toDomain);
	}

	@Override
	public List<TourDataSpotModel> findByRegionAndSigungu(String reg, String sigungu) {
		return tourDataSpotJpaRepository.findByRegAndSigungu(reg, sigungu).stream()
			.map(this::toDomain)
			.toList();
	}

	@Override
	public List<TourDataSpotModel> findByRegionAndSigunguAndImageNotCollected(String reg, String sigungu) {
		return tourDataSpotJpaRepository.findByRegAndSigunguAndImageCollectedAtIsNull(reg, sigungu).stream()
			.map(this::toDomain)
			.toList();
	}

	@Override
	public List<TourDataSpotModel> findByRegionAndSigunguAndInfoNotCollected(String reg, String sigungu) {
		return tourDataSpotJpaRepository.findByRegAndSigunguAndInfoCollectedAtIsNull(reg, sigungu).stream()
			.map(this::toDomain)
			.toList();
	}

	@Override
	public List<TourDataSpotModel> findByRegionAndSigunguAndDescriptionNotCollected(String reg, String sigungu) {
		return tourDataSpotJpaRepository.findDescriptionsNotCollected(reg, sigungu).stream()
			.map(this::toDomain)
			.toList();
	}

	@Override
	public long countAll() {
		return tourDataSpotJpaRepository.count();
	}

	private TourDataSpotJpaEntity toEntity(TourDataSpotModel model) {
		return TourDataSpotJpaEntity.builder()
			.tourDataSpotId(model.tourDataSpotId())
			.contentId(model.contentId())
			.spotId(model.spotId())
			.address(model.address())
			.category(model.category())
			.createdTime(model.createdTime())
			.thumbnail(model.thumbnail())
			.mapX(model.mapX())
			.mapY(model.mapY())
			.title(model.title())
			.reg(model.reg())
			.sigungu(model.sigungu())
			.lcls(model.lcls())
			.zipcode(model.zipcode())
			.imageCollectedAt(model.imageCollectedAt())
			.infoCollectedAt(model.infoCollectedAt())
			.createdAt(model.createdAt())
			.updatedAt(model.updatedAt())
			.build();
	}

	private TourDataSpotModel toDomain(TourDataSpotJpaEntity entity) {
		return TourDataSpotModel.builder()
			.tourDataSpotId(entity.getTourDataSpotId())
			.contentId(entity.getContentId())
			.spotId(entity.getSpotId())
			.address(entity.getAddress())
			.category(entity.getCategory())
			.createdTime(entity.getCreatedTime())
			.thumbnail(entity.getThumbnail())
			.mapX(entity.getMapX())
			.mapY(entity.getMapY())
			.title(entity.getTitle())
			.reg(entity.getReg())
			.sigungu(entity.getSigungu())
			.lcls(entity.getLcls())
			.zipcode(entity.getZipcode())
			.imageCollectedAt(entity.getImageCollectedAt())
			.infoCollectedAt(entity.getInfoCollectedAt())
			.createdAt(entity.getCreatedAt())
			.updatedAt(entity.getUpdatedAt())
			.build();
	}
}
