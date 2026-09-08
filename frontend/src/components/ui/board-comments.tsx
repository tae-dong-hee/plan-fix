import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send, UserRound } from "lucide-react";

type LocalComment = {
  id: number;
  content: string;
  createdAt: number;
};

function relativeTime(createdAt: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (minutes === 0) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function BoardComments() {
  const [draft, setDraft] = useState("");
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [now, setNow] = useState(Date.now);
  const nextId = useRef(1);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const hasComments = comments.length > 0;

  useEffect(() => {
    if (!hasComments) return;
    const updateTime = () => setNow(Date.now());
    const interval = window.setInterval(updateTime, 1000);
    document.addEventListener("visibilitychange", updateTime);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", updateTime);
    };
  }, [hasComments]);

  const submitComment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || content.length > 1000) return;
    const createdAt = Date.now();
    const comment = { id: nextId.current++, content, createdAt };
    setComments((previous) => [...previous, comment]);
    setNow(createdAt);
    setDraft("");
    textarea.current?.focus();
  };

  return (
    <section id="board-comments" aria-labelledby="board-comments-title" className="mt-12 scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-primary/15 bg-background shadow-panel sm:mt-16">
      <div className="border-b border-primary/10 bg-gradient-to-br from-primary/10 via-primary/[0.03] to-background px-5 py-6 sm:px-7">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id="board-comments-title" className="text-xl font-bold tracking-tight">댓글</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary" aria-label={`작성한 댓글 ${comments.length}개`}>{comments.length}</span>
        </div>
      </div>

      <div className="px-5 py-6 sm:px-7">
        <form onSubmit={submitComment} className="rounded-2xl border border-primary/15 bg-background p-4 shadow-sm transition-shadow focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/5 sm:p-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
            <label htmlFor="board-comment-content" className="text-sm font-semibold">댓글 남기기</label>
          </div>
          <textarea
            ref={textarea}
            id="board-comment-content"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="공감한 이야기나 나만의 여행 팁을 남겨주세요."
            maxLength={1000}
            rows={3}
            aria-describedby="board-comment-hint board-comment-count"
            className="block min-h-24 w-full resize-y bg-transparent text-sm leading-7 text-foreground outline-none placeholder:text-muted-foreground/65"
          />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <p id="board-comment-count" className="text-xs tabular-nums text-muted-foreground"><span className={draft.length ? "font-medium text-primary" : ""}>{draft.length.toLocaleString()}</span> / 1,000</p>
            <button type="submit" disabled={!draft.trim()} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/40 disabled:shadow-none sm:px-5">
              <Send className="h-4 w-4" aria-hidden="true" />댓글 등록
            </button>
          </div>
        </form>
        <p id="board-comment-hint" className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">서로를 존중하는 따뜻한 한마디를 남겨주세요.</p>
        <p role="status" className="sr-only">{hasComments ? `댓글 ${comments.length}개를 등록했습니다.` : ""}</p>

        {!hasComments && (
          <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
            <MessageCircle className="h-8 w-8 text-primary/40" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-sm">첫 댓글을 남겨보세요.</p>
          </div>
        )}
        <ul aria-label="댓글 목록" className="mt-6 divide-y divide-border/60">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3 py-5 first:pt-2 last:pb-1 sm:gap-4">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold">나</span>
                  <time dateTime={new Date(comment.createdAt).toISOString()} title={new Date(comment.createdAt).toLocaleString("ko-KR")} className="text-[11px] text-muted-foreground">{relativeTime(comment.createdAt, now)}</time>
                </div>
                <p className="mt-2.5 whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90 [overflow-wrap:anywhere]">{comment.content}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
