package taedonghee.plan_fix.infrastructure.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSearchCondition;
import taedonghee.plan_fix.domain.spot.SpotSortType;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.time.OffsetDateTime;
import java.util.Objects;

/**
 * [infrastructure] domain.SpotRepository 포트의 JPA 구현체(어댑터).
 * domain <- infrastructure: domain의 인터페이스를 구현하며, JPA 엔티티 <-> domain 모델 변환을 책임진다.
 */
@Repository
@RequiredArgsConstructor
public class SpotRepositoryImpl implements SpotRepository {

	private final SpotJpaRepository spotJpaRepository;

	@Override
	public SpotModel save(SpotModel spot) {
		SpotJpaEntity saved = spotJpaRepository.save(toEntity(spot));
		return toDomain(saved);
	}

	@Override
	public Optional<SpotModel> findById(Long spotId) {
		return spotJpaRepository.findById(spotId).map(this::toDomain);
	}

	@Override
	public List<SpotModel> findAllByIdIn(Collection<Long> spotIds) {
		if (spotIds == null || spotIds.isEmpty()) {
			return List.of();
		}
		return spotJpaRepository.findAllBySpotIdIn(spotIds).stream().map(this::toDomain).toList();
	}

	@Override
	public long countAll() {
		return spotJpaRepository.count();
	}

	@Override
	public List<SpotModel> searchActive(SpotSearchCondition condition, SpotSortType sort, int offset, int limit) {
		List<SpotJpaEntity> entities = switch (sort) {
			case LATEST -> spotJpaRepository.searchActiveByLatest(
					condition.keyword(), condition.category(), condition.region(), condition.sigungu(), limit, offset);
			case POPULAR -> spotJpaRepository.searchActiveByPopular(
					condition.keyword(), condition.category(), condition.region(), condition.sigungu(), limit, offset);
		};
		return entities.stream().map(this::toDomain).toList();
	}

	@Override
	public long countActive(SpotSearchCondition condition) {
		return spotJpaRepository.countActive(condition.keyword(), condition.category(), condition.region(), condition.sigungu());
	}

	@Override
	public void incrementViewCount(Long spotId) {
		spotJpaRepository.incrementViewCount(spotId);
	}

	@Override
	public void incrementLikeCount(Long spotId) {
		spotJpaRepository.incrementLikeCount(spotId);
	}

	@Override
	public void decrementLikeCount(Long spotId) {
		spotJpaRepository.decrementLikeCount(spotId);
	}

	@Override
	@Transactional
	public boolean fillTourApiDescriptionIfMissing(Long spotId, String description) {
		Objects.requireNonNull(description, "description must record either an overview or a successful empty result");
		return spotJpaRepository.fillTourApiDescriptionIfMissing(spotId, description, OffsetDateTime.now()) > 0;
	}

	@Override
	@Transactional
	public boolean updateTourApiListing(Long spotId, SpotModel.SourceAttributes attributes) {
		return spotJpaRepository.updateTourApiListing(spotId, attributes.title(), attributes.category(), attributes.region(),
			attributes.sigungu(), attributes.address(), attributes.latitude(), attributes.longitude(), attributes.thumbnail(),
			OffsetDateTime.now()) > 0;
	}

	@Override
	public List<SpotModel> findLikedByUserId(Long userId) {
		return spotJpaRepository.findLikedSpotsByUserId(userId).stream()
				.map(this::toDomain)
				.toList();
	}

	private SpotJpaEntity toEntity(SpotModel spot) {
		return SpotJpaEntity.builder()
			.spotId(spot.spotId())
			.sourceType(spot.sourceType())
			.title(spot.title())
			.category(spot.category())
			.region(spot.region())
			.sigungu(spot.sigungu())
			.address(spot.address())
			.latitude(spot.latitude())
			.longitude(spot.longitude())
			.thumbnail(spot.thumbnail())
			.description(spot.description())
			.viewCount(spot.viewCount())
			.likeCount(spot.likeCount())
			.commentCount(spot.commentCount())
			.status(spot.status())
			.createdAt(spot.createdAt())
			.updatedAt(spot.updatedAt())
			.build();
	}

	private SpotModel toDomain(SpotJpaEntity entity) {
		return SpotModel.builder()
			.spotId(entity.getSpotId())
			.sourceType(entity.getSourceType())
			.title(entity.getTitle())
			.category(entity.getCategory())
			.region(entity.getRegion())
			.sigungu(entity.getSigungu())
			.address(entity.getAddress())
			.latitude(entity.getLatitude())
			.longitude(entity.getLongitude())
			.thumbnail(entity.getThumbnail())
			.description(entity.getDescription())
			.viewCount(entity.getViewCount())
			.likeCount(entity.getLikeCount())
			.commentCount(entity.getCommentCount())
			.status(entity.getStatus())
			.createdAt(entity.getCreatedAt())
			.updatedAt(entity.getUpdatedAt())
			.build();
	}
}
