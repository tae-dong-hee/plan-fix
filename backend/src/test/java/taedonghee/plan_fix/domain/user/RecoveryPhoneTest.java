package taedonghee.plan_fix.domain.user;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.support.error.CoreException;

import static org.assertj.core.api.Assertions.*;

class RecoveryPhoneTest {
    @Test
    void normalizesDomesticAndInternationalFormattingToOneNumber() {
        assertThat(RecoveryPhone.normalize("010-1234-5678")).isEqualTo("01012345678");
        assertThat(RecoveryPhone.normalize("+82 10 1234 5678")).isEqualTo("01012345678");
        assertThat(RecoveryPhone.mask("01012345678")).isEqualTo("010-****-5678");
    }

    @Test
    void rejectsArbitraryTextExtensionsLandlinesAndNonKoreanNumbers() {
        for (String phone : new String[]{null, "", "0101234567", "010123456789", "0212345678", "+15551234567", "01012345678x1", "01012345678\n"}) {
            assertThatThrownBy(() -> RecoveryPhone.normalize(phone)).isInstanceOf(CoreException.class);
        }
    }
}
