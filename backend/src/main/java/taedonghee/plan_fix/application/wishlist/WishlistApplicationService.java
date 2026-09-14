package taedonghee.plan_fix.application.wishlist;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.application.board.BoardApplicationService;
import taedonghee.plan_fix.application.board.BoardResult;
import taedonghee.plan_fix.application.course.CourseApplicationService;
import taedonghee.plan_fix.application.course.CourseResult;
import taedonghee.plan_fix.application.spot.SpotThumbnailResolver;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;

import java.util.List;
import java.util.Map;

/**
 * 위시리스트 Application Service
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class WishlistApplicationService {

    private final SpotRepository spotRepository;
    private final CourseApplicationService courseApplicationService;
    private final BoardApplicationService boardApplicationService;
    private final SpotThumbnailResolver spotThumbnailResolver;

    /**
     * 사용자가 좋아요 누른 스팟 목록 조회
     */
    public List<WishlistSpotResult> listLikedSpots(Long userId) {
        List<SpotModel> spots = spotRepository.findLikedByUserId(userId);
        Map<Long, String> thumbnails = spotThumbnailResolver.resolve(spots);
        return spots.stream()
                .map(spot -> WishlistSpotResult.from(spot, thumbnails.get(spot.spotId())))
                .toList();
    }

    /**
     * 사용자가 좋아요 누른 코스 목록 조회
     */
    public List<CourseResult> listLikedCourses(Long userId) {
        return courseApplicationService.listLiked(userId);
    }

    /**
     * 사용자가 좋아요 누른 게시글 목록 조회
     */
    public List<BoardResult> listLikedBoards(Long userId) {
        return boardApplicationService.listLiked(userId);
    }
}
