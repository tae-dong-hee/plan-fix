package taedonghee.plan_fix.support;

import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.test.context.support.TestPropertySourceUtils;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class IsolatedPostgresContextCustomizerFactoryTest {

    @Test
    void shared_database_settings_cannot_override_disposable_database() {
        try (GenericApplicationContext context = new GenericApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("shared-database", Map.of(
                    "spring.datasource.url", "jdbc:postgresql://shared.invalid/production",
                    "spring.datasource.username", "production-user",
                    "spring.datasource.password", "production-password",
                    "spring.datasource.hikari.jdbc-url", "jdbc:postgresql://shared.invalid/production",
                    "spring.datasource.hikari.username", "production-user",
                    "spring.datasource.hikari.password", "production-password",
                    "spring.jpa.hibernate.ddl-auto", "create-drop")));
            TestPropertySourceUtils.addInlinedPropertiesToEnvironment(context,
                    "spring.datasource.url=jdbc:postgresql://another-shared.invalid/production");

            new IsolatedPostgresContextCustomizerFactory()
                    .createContextCustomizer(getClass(), List.of())
                    .customizeContext(context, null);

            var environment = context.getEnvironment();
            assertThat(environment.getProperty("spring.datasource.url"))
                    .isEqualTo(IsolatedPostgresContextCustomizerFactory.JDBC_URL);
            assertThat(environment.getProperty("spring.datasource.hikari.jdbc-url"))
                    .isEqualTo(IsolatedPostgresContextCustomizerFactory.JDBC_URL);
            assertThat(environment.getProperty("spring.datasource.driver-class-name"))
                    .isEqualTo("org.testcontainers.jdbc.ContainerDatabaseDriver");
            assertThat(environment.getProperty("spring.datasource.username")).isEqualTo("test");
            assertThat(environment.getProperty("spring.datasource.password")).isEqualTo("test");
            assertThat(environment.getProperty("spring.datasource.hikari.username")).isEqualTo("test");
            assertThat(environment.getProperty("spring.datasource.hikari.password")).isEqualTo("test");
            assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("update");
        }
    }
}
