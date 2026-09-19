package taedonghee.plan_fix.interfaces.api.spot;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import taedonghee.plan_fix.application.spot.SpotDetailApplicationService;
import taedonghee.plan_fix.application.spot.RecommendedSpotApplicationService;
import taedonghee.plan_fix.application.spot.RecommendedSpotQuery;
import taedonghee.plan_fix.application.spot.SpotListApplicationService;
import taedonghee.plan_fix.application.spot.SpotListQuery;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;

/**
 * [interfaces] 공개 스팟 조회 API. 컨트롤러는 HTTP 변환만 담당하고, 처리는 application에 위임한다.
 */
@RestController
@RequestMapping("/api/v1/spots")
@RequiredArgsConstructor
public class SpotController {

    private final SpotListApplicationService spotListApplicationService;
    private final SpotDetailApplicationService spotDetailApplicationService;
    private final RecommendedSpotApplicationService recommendedSpotApplicationService;

    /** 메인 대표 장소는 매번 새로 선택하며 브라우저/공유 캐시에 저장하지 않는다. */
    @GetMapping("/recommended")
    public ResponseEntity<SpotResponse> recommended(
            @RequestParam(defaultValue = "51") String region,
            @RequestParam(required = false) String sigungu,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        Long viewerUserId = principal == null ? null : principal.id();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(SpotResponse.from(recommendedSpotApplicationService.list(
                        new RecommendedSpotQuery(region, sigungu, size), viewerUserId)));
    }

    /** 예: GET /api/v1/spots?keyword=속초&category=관광지&region=51&sigungu=150&sort=popular&offset=0&size=20 */
    @GetMapping
    public ResponseEntity<SpotResponse> list(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String region,
            @RequestParam(required = false) String sigungu,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int offset,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        SpotListQuery query = new SpotListQuery(keyword, category, region, sigungu, sort, offset, size);
        Long viewerUserId = principal == null ? null : principal.id();
        return ResponseEntity.ok(SpotResponse.from(spotListApplicationService.list(query, viewerUserId)));
    }

    /**
     * 예: GET /api/v1/spots/1. 존재하지 않거나 HIDDEN이면 GlobalExceptionHandler가 404로 변환한다.
     * 이 경로는 permitAll이지만 JwtAuthenticationFilter는 모든 요청에서 실행되므로, 유효한
     * access_token 쿠키가 있으면 principal이 채워져 본인의 좋아요 여부(isLiked)를 알 수 있다.
     * 비로그인이면 principal이 null이라 viewerUserId도 null이 되고, isLiked는 항상 false다.
     */
    @GetMapping("/{spotId}")
    public ResponseEntity<SpotDetailResponse> get(
            @PathVariable Long spotId,
            @AuthenticationPrincipal AuthenticatedUser principal
    ) {
        Long viewerUserId = principal == null ? null : principal.id();
        return ResponseEntity.ok(SpotDetailResponse.from(spotDetailApplicationService.get(spotId, viewerUserId)));
    }
}
