package taedonghee.plan_fix.application.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.user.SocialAccountModel;
import taedonghee.plan_fix.domain.user.SocialAccountRepository;
import taedonghee.plan_fix.domain.user.SocialProvider;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.infrastructure.oauth.KakaoOAuthClient;
import taedonghee.plan_fix.infrastructure.oauth.KakaoUser;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.Optional;

/**
 * 소셜 로그인 Application Service
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SocialLoginApplicationService {

    private static final int USERNAME_MAX_LENGTH = 30;
    private static final int MAX_USERNAME_ATTEMPTS = 1000;
    private static final String FALLBACK_NICKNAME = "여행자";

    private final KakaoOAuthClient kakaoOAuthClient;
    private final UserRepository userRepository;
    private final SocialAccountRepository socialAccountRepository;
    private final AuthTokenProvider authTokenProvider;

    /**
     * 카카오 인가 코드로 로그인 처리
     */
    @Transactional
    public AuthResult loginWithKakao(String code, String codeVerifier) {
        String kakaoAccessToken = kakaoOAuthClient.exchangeCodeForAccessToken(code, codeVerifier);
        KakaoUser kakaoUser = kakaoOAuthClient.fetchUser(kakaoAccessToken);

        UserModel user = resolveUser(kakaoUser);
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new CoreException(ErrorType.FORBIDDEN, "Inactive user cannot login. userId=" + user.getUserId());
        }

        return AuthResult.of(authTokenProvider.create(user), user);
    }

    /**
     * 소셜 계정 조회 → 이메일 연결 → 신규 생성 순으로 사용자 확정
     */
    private UserModel resolveUser(KakaoUser kakaoUser) {
        Optional<SocialAccountModel> linked = socialAccountRepository
                .findByProviderAndProviderUserId(SocialProvider.KAKAO, kakaoUser.id());
        if (linked.isPresent()) {
            return userRepository.findByUserId(linked.get().getUserId())
                    .orElseThrow(() -> new CoreException(
                            ErrorType.NOT_FOUND, "User not found. userId=" + linked.get().getUserId()));
        }

        try {
            return linkOrCreate(kakaoUser);
        } catch (DataIntegrityViolationException e) {
            // 같은 사용자의 동시 첫 로그인. 유니크 제약이 막았으므로 이미 만들어진 쪽을 쓴다.
            return socialAccountRepository
                    .findByProviderAndProviderUserId(SocialProvider.KAKAO, kakaoUser.id())
                    .flatMap(account -> userRepository.findByUserId(account.getUserId()))
                    .orElseThrow(() -> new CoreException(ErrorType.CONFLICT, "소셜 계정 연결에 실패했습니다."));
        }
    }

    /**
     * 인증된 이메일이면 기존 계정에 연결하고, 아니면 신규 사용자를 만든다
     */
    private UserModel linkOrCreate(KakaoUser kakaoUser) {
        String verifiedEmail = kakaoUser.emailVerified() ? kakaoUser.email() : null;

        if (verifiedEmail != null) {
            Optional<UserModel> byEmail = userRepository.findByEmail(verifiedEmail);
            if (byEmail.isPresent()) {
                UserModel existing = byEmail.get();
                socialAccountRepository.save(SocialAccountModel.create(
                        existing.getUserId(), SocialProvider.KAKAO, kakaoUser.id(), kakaoUser.email()));
                return existing;
            }
        }

        UserModel created = userRepository.save(
                    UserModel.create(uniqueUsername(kakaoUser.nickname()), null, verifiedEmail, null));
        socialAccountRepository.save(SocialAccountModel.create(
                created.getUserId(), SocialProvider.KAKAO, kakaoUser.id(), kakaoUser.email()));
        return created;
    }

    /**
     * 닉네임이 이미 쓰이고 있으면 뒤에 숫자를 붙여 유니크하게 만든다
     */
    private String uniqueUsername(String nickname) {
        String base = normalizeNickname(nickname);
        if (!userRepository.existsByUsername(base)) {
            return base;
        }
        for (int suffix = 2; suffix < MAX_USERNAME_ATTEMPTS; suffix++) {
            String candidate = truncateForSuffix(base, suffix) + suffix;
            if (!userRepository.existsByUsername(candidate)) {
                return candidate;
            }
        }
        throw new CoreException(ErrorType.CONFLICT, "사용 가능한 username을 찾지 못했습니다.");
    }

    /**
     * 카카오 닉네임을 username 규칙(2~30자, 공백 정리)에 맞게 다듬는다
     */
    private String normalizeNickname(String nickname) {
        if (nickname == null || nickname.isBlank()) {
            return FALLBACK_NICKNAME;
        }
        String normalized = nickname.strip().replaceAll("\\s+", " ");
        if (normalized.length() > USERNAME_MAX_LENGTH) {
            normalized = normalized.substring(0, USERNAME_MAX_LENGTH).strip();
        }
        if (normalized.length() < 2) {
            return FALLBACK_NICKNAME;
        }
        return normalized;
    }

    /**
     * 숫자 접미를 붙여도 30자를 넘지 않도록 앞부분을 자른다
     */
    private String truncateForSuffix(String base, int suffix) {
        int room = USERNAME_MAX_LENGTH - String.valueOf(suffix).length();
        return base.length() <= room ? base : base.substring(0, room).strip();
    }
}
