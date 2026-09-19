package taedonghee.plan_fix.application.auth;

import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

/** Transient delivery receipt. Never persist or log the raw token or recipient. */
public final class PasswordResetMail {
    private final String recipient;
    private final String token;
    private volatile boolean accepted;

    public PasswordResetMail(String recipient, String token) {
        this.recipient = recipient;
        this.token = token;
    }

    public String recipient() { return recipient; }
    public String token() { return token; }

    public void markAccepted() { accepted = true; }

    public void requireAccepted() {
        if (!accepted) {
            throw new CoreException(ErrorType.SERVICE_UNAVAILABLE,
                    "재설정 메일 발송을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        }
    }

    @Override
    public String toString() {
        return "PasswordResetMail[redacted]";
    }
}
