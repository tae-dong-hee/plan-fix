package taedonghee.plan_fix.infrastructure.route;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "routing.kakao")
public record KakaoRoadProperties(String apiKey) {
}
