package taedonghee.plan_fix.interfaces.api.user;

import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import taedonghee.plan_fix.application.user.ProfileImageApplicationService;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

@RestController
@RequestMapping("/api/v1/users/me/profile-image")
@RequiredArgsConstructor
public class ProfileImageController {
    private final ProfileImageApplicationService profileImages;

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UserResponse> upload(@AuthenticationPrincipal AuthenticatedUser principal,
                                               @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(UserResponse.from(profileImages.upload(userId(principal), file)));
    }

    @DeleteMapping
    public ResponseEntity<UserResponse> remove(@AuthenticationPrincipal AuthenticatedUser principal) {
        return ResponseEntity.ok(UserResponse.from(profileImages.remove(userId(principal))));
    }

    @GetMapping
    public ResponseEntity<byte[]> get(@AuthenticationPrincipal AuthenticatedUser principal) {
        var image = profileImages.get(userId(principal));
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.contentType()))
                .contentLength(image.bytes().length).cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff").body(image.bytes());
    }

    private Long userId(AuthenticatedUser principal) {
        if (principal == null) throw new CoreException(ErrorType.UNAUTHORIZED);
        return principal.id();
    }
}
