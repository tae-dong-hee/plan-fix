package taedonghee.plan_fix.infrastructure.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import taedonghee.plan_fix.domain.spot.TourDataImageModel;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;

import java.util.Collection;
import java.util.List;

/**
 * [infrastructure] domain.TourDataImageRepository 포트의 JPA 구현체(어댑터).
 * domain <- infrastructure: domain의 인터페이스를 구현하며, JPA 엔티티 <-> domain 모델 변환을 책임진다.
 */
@Repository
@RequiredArgsConstructor
public class TourDataImageRepositoryImpl implements TourDataImageRepository {

	private final TourDataImageJpaRepository tourDataImageJpaRepository;

	@Override
	public TourDataImageModel save(TourDataImageModel image) {
		return toDomain(tourDataImageJpaRepository.save(toEntity(image)));
	}

	@Override
	public void saveAll(List<TourDataImageModel> images) {
		tourDataImageJpaRepository.saveAll(images.stream().map(this::toEntity).toList());
	}

	@Override
	public List<TourDataImageModel> findByTourDataSpotId(Long tourDataSpotId) {
		return tourDataImageJpaRepository.findByTourDataSpotId(tourDataSpotId).stream()
			.map(this::toDomain)
			.toList();
	}

	@Override
	public void deleteByTourDataSpotId(Long tourDataSpotId) {
		tourDataImageJpaRepository.deleteByTourDataSpotId(tourDataSpotId);
	}

	@Override
	public List<SpotImageCandidate> findBySpotIds(Collection<Long> spotIds) {
		if (spotIds == null || spotIds.isEmpty()) {
			return List.of();
		}
		return tourDataImageJpaRepository.findBySpotIds(spotIds);
	}

	@Override
	public long countAll() {
		return tourDataImageJpaRepository.count();
	}

	private TourDataImageJpaEntity toEntity(TourDataImageModel model) {
		return TourDataImageJpaEntity.builder()
			.tourDataImageId(model.tourDataImageId())
			.tourDataSpotId(model.tourDataSpotId())
			.contentId(model.contentId())
			.imageName(model.imageName())
			.originalImage(model.originalImage())
			.smallImage(model.smallImage())
			.createdAt(model.createdAt())
			.updatedAt(model.updatedAt())
			.build();
	}

	private TourDataImageModel toDomain(TourDataImageJpaEntity entity) {
		return TourDataImageModel.builder()
			.tourDataImageId(entity.getTourDataImageId())
			.tourDataSpotId(entity.getTourDataSpotId())
			.contentId(entity.getContentId())
			.imageName(entity.getImageName())
			.originalImage(entity.getOriginalImage())
			.smallImage(entity.getSmallImage())
			.createdAt(entity.getCreatedAt())
			.updatedAt(entity.getUpdatedAt())
			.build();
	}
}
