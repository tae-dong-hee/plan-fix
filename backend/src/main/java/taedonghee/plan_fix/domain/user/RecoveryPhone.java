package taedonghee.plan_fix.domain.user;

import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

/** Korean mobile numbers are stored once, in the same domestic format. */
public final class RecoveryPhone {
    private RecoveryPhone() { }

    public static String normalize(String raw) {
        if (raw == null || raw.length() > 24 || !raw.matches("[+0-9 ()-]+")) {
            throw invalid();
        }
        String phone = raw.replaceAll("[ ()-]", "");
        if (phone.startsWith("+82")) phone = "0" + phone.substring(3);
        if (!phone.matches("010[0-9]{8}")) throw invalid();
        return phone;
    }

    public static String mask(String phone) {
        return phone.substring(0, 3) + "-****-" + phone.substring(7);
    }

    private static CoreException invalid() {
        return new CoreException(ErrorType.BAD_REQUEST, "휴대폰번호를 정확히 입력해 주세요. (010으로 시작하는 11자리)");
    }
}
