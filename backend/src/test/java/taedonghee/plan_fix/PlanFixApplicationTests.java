package taedonghee.plan_fix;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import javax.sql.DataSource;
import java.sql.SQLException;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class PlanFixApplicationTests {

	@Autowired
	private DataSource dataSource;

	@Test
	void contextLoadsWithDisposablePostgres() throws SQLException {
		try (var connection = dataSource.getConnection();
			 var statement = connection.createStatement();
			 var result = statement.executeQuery("SELECT current_database(), current_user")) {
			assertThat(result.next()).isTrue();
			assertThat(result.getString(1)).isEqualTo("planfix_test");
			assertThat(result.getString(2)).isEqualTo("test");
			assertThat(connection.getMetaData().getDatabaseProductName()).isEqualTo("PostgreSQL");
		}
	}

}
