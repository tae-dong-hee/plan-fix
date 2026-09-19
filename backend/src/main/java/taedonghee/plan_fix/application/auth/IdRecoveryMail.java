package taedonghee.plan_fix.application.auth;

import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.List;

/** A transient SMTP receipt; account IDs are sent only to the registered mailbox. */
public final class IdRecoveryMail {
    private final String recipient;
    private final List<String> loginIds;
    private volatile boolean accepted;

    public IdRecoveryMail(String recipient, List<String> loginIds) {
        this.recipient = recipient;
        this.loginIds = List.copyOf(loginIds);
    }

    public String recipient() { return recipient; }
    public List<String> loginIds() { return loginIds; }
    public void markAccepted() { accepted = true; }

    public void requireAccepted() {
        if (!accepted) throw new CoreException(ErrorType.SERVICE_UNAVAILABLE,
                "아이디 안내 메일 발송을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }

    @Override public String toString() { return "IdRecoveryMail[redacted]"; }
}
