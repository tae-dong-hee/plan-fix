package taedonghee.plan_fix.application.auth;

/** Transient event only. Never persist or log the raw token or recipient. */
public record PasswordResetMail(String recipient, String token) {
    @Override
    public String toString() {
        return "PasswordResetMail[redacted]";
    }
}
