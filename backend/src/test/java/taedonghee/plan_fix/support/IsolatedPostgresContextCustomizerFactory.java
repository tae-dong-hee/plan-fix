package taedonghee.plan_fix.support;

import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.test.context.ContextConfigurationAttributes;
import org.springframework.test.context.ContextCustomizer;
import org.springframework.test.context.ContextCustomizerFactory;
import org.springframework.test.context.MergedContextConfiguration;
import org.springframework.test.context.support.TestPropertySourceUtils;

import java.util.List;

/**
 * Every Spring test uses disposable PostgreSQL, including IDE runs and newly added tests.
 * Applying these properties after config loading prevents environment variables or a
 * developer's application-secret.yml from redirecting fixtures into a shared database.
 * The JDBC driver starts a container only when a test actually opens a connection.
 */
public class IsolatedPostgresContextCustomizerFactory implements ContextCustomizerFactory {

    static final String JDBC_URL = "jdbc:tc:postgresql:17-alpine:///planfix_test?TC_DAEMON=true";

    @Override
    public ContextCustomizer createContextCustomizer(Class<?> testClass,
                                                     List<ContextConfigurationAttributes> configAttributes) {
        return IsolatedDatabase.INSTANCE;
    }

    // An enum gives all test contexts a stable cache key. The container remains alive
    // across contexts, then Testcontainers removes it when the test JVM exits.
    private enum IsolatedDatabase implements ContextCustomizer {
        INSTANCE;

        @Override
        public void customizeContext(ConfigurableApplicationContext context,
                                     MergedContextConfiguration mergedConfig) {
            TestPropertySourceUtils.addInlinedPropertiesToEnvironment(context,
                    "spring.datasource.url=" + JDBC_URL,
                    "spring.datasource.driver-class-name=org.testcontainers.jdbc.ContainerDatabaseDriver",
                    "spring.datasource.username=test",
                    "spring.datasource.password=test",
                    "spring.datasource.hikari.jdbc-url=" + JDBC_URL,
                    "spring.datasource.hikari.driver-class-name=org.testcontainers.jdbc.ContainerDatabaseDriver",
                    "spring.datasource.hikari.username=test",
                    "spring.datasource.hikari.password=test",
                    "spring.jpa.hibernate.ddl-auto=update");
        }
    }
}
