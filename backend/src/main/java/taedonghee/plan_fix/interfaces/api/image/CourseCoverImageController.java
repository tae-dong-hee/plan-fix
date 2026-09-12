package taedonghee.plan_fix.interfaces.api.image;

import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import taedonghee.plan_fix.application.image.CourseCoverImageApplicationService;

import java.time.Duration;

@RestController
@RequestMapping("/api/v1/images/course-covers")
@RequiredArgsConstructor
public class CourseCoverImageController {

    private final CourseCoverImageApplicationService courseCoverImageApplicationService;

    @Operation(summary = "코스 대표 사진 조회", description = "등록된 기본 코스 대표 사진만 제공합니다.")
    @GetMapping("/{id}")
    public ResponseEntity<byte[]> get(@PathVariable String id,
                                      @RequestParam(required = false) String v) {
        var image = courseCoverImageApplicationService.get(id);
        CacheControl cacheControl = image.version().equals(v)
                ? CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable()
                : CacheControl.maxAge(Duration.ofHours(1)).cachePublic();
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                .contentLength(image.bytes().length)
                .cacheControl(cacheControl)
                .eTag(image.sha256())
                .body(image.bytes());
    }
}
