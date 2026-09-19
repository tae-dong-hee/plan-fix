package taedonghee.plan_fix.infrastructure.security;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * Spring Security 기본 설정
 */
@Configuration
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Value("${app.frontend-base-url}")
    private String frontendBaseUrl;

    /**
     * URL 접근 권한 및 JWT 필터 설정
     */
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) -> {
                            response.setStatus(jakarta.servlet.http.HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"code\":\"Unauthorized\",\"message\":\"인증이 필요합니다. (로그인이 필요합니다)\"}");
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            response.setStatus(jakarta.servlet.http.HttpServletResponse.SC_FORBIDDEN);
                            response.setContentType("application/json;charset=UTF-8");
                            response.getWriter().write("{\"code\":\"Forbidden\",\"message\":\"접근 권한이 없습니다. (ADMIN 권한 필요)\"}");
                        })
                )
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ASYNC).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/users").permitAll()
                        // 회원가입 전에도 아이디와 이메일 사용 가능 여부를 확인할 수 있어야 한다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/username-availability", "/api/v1/users/email-availability").permitAll()
                        // 댓글에 작성자 사진을 표시한다. 내 사진 조회·변경은 계속 인증이 필요하다.
                        .requestMatchers("/api/v1/users/me/profile-image").authenticated()
                        .requestMatchers(HttpMethod.GET, "/api/v1/users/*/profile-image").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/login").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/logout").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/password-reset/request",
                                "/api/v1/auth/password-reset/confirm").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/auth/id-recovery/request").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/kakao", "/api/v1/auth/kakao/callback").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/spots", "/api/v1/spots/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/boards", "/api/v1/boards/*").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/courses/*").permitAll()
                        // 공개 코스의 지도도 도로 경로를 표시할 수 있도록 허용한다. 키는 서버에만 보관한다.
                        .requestMatchers(HttpMethod.POST, "/api/v1/routes/driving").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/locations/geocode").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/locations/search").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/locations/address-suggestions").permitAll()
                        // 카카오톡 초대 링크를 연 비회원도 코스 제목·초대 권한을 확인할 수 있다.
                        // 실제 참여(POST /accept)는 인증이 필요하다.
                        .requestMatchers(HttpMethod.GET, "/api/v1/course-invites/*").permitAll()
                        .requestMatchers("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs/**").permitAll()
                        .requestMatchers("/api/v1/admin/**").permitAll()
                        .requestMatchers("/api/v1/ai/**").permitAll()
                        .requestMatchers("/api/v1/images/**").permitAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    /**
     * 쿠키 인증을 위한 CORS 설정
     * allowCredentials(true)는 allowedOrigins("*")와 함께 쓸 수 없으므로 origin을 명시한다.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(frontendBaseUrl));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    /**
     * BCrypt PasswordEncoder Bean
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
