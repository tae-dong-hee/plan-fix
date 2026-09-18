package taedonghee.plan_fix.infrastructure.spot;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotLikeModel;
import taedonghee.plan_fix.domain.spot.SpotLikeRepository;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * spot_likes에 실제로 저장/조회/삭제되는지, 유니크 제약(user_id, spot_id)이 실제로 걸려 있는지 본다.
 * 임시 PostgreSQL을 사용하며 @Transactional로 테스트 사이의 데이터도 롤백한다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class SpotLikeRepositoryImplTest {

    @Autowired
    private SpotLikeRepository spotLikeRepository;

    @Autowired
    private SpotRepository spotRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void 좋아요를_저장하고_존재_여부를_조회한다() {
        Long userId = saveUser().getUserId();
        Long spotId = saveSpot().spotId();

        assertThat(spotLikeRepository.existsByUserIdAndSpotId(userId, spotId)).isFalse();

        spotLikeRepository.save(SpotLikeModel.create(userId, spotId));

        assertThat(spotLikeRepository.existsByUserIdAndSpotId(userId, spotId)).isTrue();
    }

    @Test
    void 같은_사용자가_같은_스팟을_두번_좋아요하면_유니크_제약에_걸린다() {
        Long userId = saveUser().getUserId();
        Long spotId = saveSpot().spotId();
        spotLikeRepository.save(SpotLikeModel.create(userId, spotId));

        assertThatThrownBy(() -> spotLikeRepository.save(SpotLikeModel.create(userId, spotId)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void 좋아요를_취소하면_삭제되고_true를_반환한다() {
        Long userId = saveUser().getUserId();
        Long spotId = saveSpot().spotId();
        spotLikeRepository.save(SpotLikeModel.create(userId, spotId));

        boolean deleted = spotLikeRepository.deleteByUserIdAndSpotId(userId, spotId);

        assertThat(deleted).isTrue();
        assertThat(spotLikeRepository.existsByUserIdAndSpotId(userId, spotId)).isFalse();
    }

    @Test
    void 좋아요하지_않은_것을_취소하면_false를_반환한다() {
        Long userId = saveUser().getUserId();
        Long spotId = saveSpot().spotId();

        boolean deleted = spotLikeRepository.deleteByUserIdAndSpotId(userId, spotId);

        assertThat(deleted).isFalse();
    }

    private UserModel saveUser() {
        return userRepository.save(UserModel.create("좋아요테스트유저" + System.nanoTime(), null, null));
    }

    private SpotModel saveSpot() {
        return spotRepository.save(SpotModel.builder()
                .sourceType(SpotSourceType.NATIVE)
                .title("테스트 스팟")
                .category("관광지")
                .build());
    }
}
