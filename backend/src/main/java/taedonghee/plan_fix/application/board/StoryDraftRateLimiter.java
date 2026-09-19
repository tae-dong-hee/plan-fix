package taedonghee.plan_fix.application.board;

import org.springframework.stereotype.Component;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;

/** Bounded, per-process guard: one request per user, 10/hour, and four concurrent model calls. */
@Component
public class StoryDraftRateLimiter {
    private static final Duration WINDOW = Duration.ofHours(1);
    private final Map<Long, Usage> users = new HashMap<>();
    private final Clock clock;
    private int active;

    public StoryDraftRateLimiter() { this(Clock.systemUTC()); }
    StoryDraftRateLimiter(Clock clock) { this.clock = clock; }

    synchronized Permit acquire(Long userId) {
        Instant now = clock.instant();
        users.values().forEach(usage -> usage.starts.removeIf(start -> !start.plus(WINDOW).isAfter(now)));
        users.values().removeIf(usage -> !usage.inFlight && usage.starts.isEmpty());
        Usage usage = users.get(userId);
        if (usage != null && usage.inFlight) throw limited("이미 사진으로 글을 쓰고 있어요. 잠시만 기다려 주세요.");
        if (usage != null && usage.starts.size() >= 10) throw limited("AI 글쓰기는 한 시간에 10번까지 사용할 수 있어요. 잠시 후 다시 이용해 주세요.");
        if (active >= 4 || (usage == null && users.size() >= 10000)) throw limited("AI 글쓰기를 이용하는 분이 많아요. 잠시 후 다시 시도해 주세요.");
        if (usage == null) {
            usage = new Usage();
            users.put(userId, usage);
        }
        usage.inFlight = true;
        usage.starts.addLast(now);
        active++;
        return new Permit(usage);
    }

    private static CoreException limited(String message) { return new CoreException(ErrorType.TOO_MANY_REQUESTS, message); }
    private static final class Usage {
        private final ArrayDeque<Instant> starts = new ArrayDeque<>();
        private boolean inFlight;
    }
    final class Permit implements AutoCloseable {
        private final Usage usage;
        private boolean closed;
        private Permit(Usage usage) { this.usage = usage; }
        @Override public void close() {
            synchronized (StoryDraftRateLimiter.this) {
                if (closed) return;
                closed = true;
                usage.inFlight = false;
                active--;
            }
        }
    }
}
