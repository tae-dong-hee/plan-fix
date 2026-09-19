package taedonghee.plan_fix.infrastructure.auth;

public interface SmsVerificationSender {
    void requireAvailable();

    /** Returns only after the SMS provider accepts the message, otherwise throws. */
    void send(String phoneNumber, String code);
}
