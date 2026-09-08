import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Heart, Loader2, MessageSquare } from "lucide-react";

import { cn } from "@/lib/utils";
import { likeBoard, unlikeBoard, type BoardItem } from "@/services/board";
import { UnauthorizedError } from "@/services/spots";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=85";

export default function BoardCard({ board, className }: { board: BoardItem; className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [liked, setLiked] = useState(!!board.isLiked);
  const [likeCount, setLikeCount] = useState(board.likeCount);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestPending = useRef(false);

  useEffect(() => {
    setLiked(!!board.isLiked);
    setLikeCount(board.likeCount);
    setError(null);
  }, [board.boardId, board.isLiked, board.likeCount]);

  const toggleLike = async () => {
    if (requestPending.current) return;
    requestPending.current = true;
    setPending(true);
    setError(null);

    try {
      const result = await (liked ? unlikeBoard(board.boardId) : likeBoard(board.boardId));
      setLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch (cause) {
      if (cause instanceof UnauthorizedError) {
        navigate("/login");
      } else {
        setError("좋아요를 저장하지 못했어요. 다시 눌러 주세요.");
      }
    } finally {
      requestPending.current = false;
      setPending(false);
    }
  };

  return (
    <article className={cn("group relative overflow-hidden rounded-lg border bg-background shadow-panel transition-shadow hover:shadow-md", className)}>
      <Link to={`/boards/${board.boardId}`} state={{ from: location.pathname + location.search }} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <div className="h-40 overflow-hidden sm:h-56">
          <img
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            src={board.thumbnail ?? FALLBACK_IMAGE}
            alt={board.title}
            loading="lazy"
          />
        </div>
        <h3 className="truncate px-3 pt-3 text-sm font-semibold sm:px-4 sm:pt-4 sm:text-base">{board.title}</h3>
      </Link>
      <button
        type="button"
        onClick={toggleLike}
        disabled={pending}
        aria-pressed={liked}
        aria-busy={pending}
        aria-label={`${board.title} 좋아요${liked ? " 취소" : ""}`}
        className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
        ) : (
          <Heart className={cn("h-5 w-5", liked ? "fill-rose-500 text-rose-500" : "text-white")} aria-hidden="true" />
        )}
      </button>
      <div className="mt-1.5 flex items-center gap-3 px-3 pb-3 text-xs text-muted-foreground sm:px-4 sm:pb-4">
        <span className="flex items-center gap-1" aria-label={`좋아요 ${likeCount}개`}>
          <Heart className={cn("h-3.5 w-3.5", liked && "fill-rose-500 text-rose-500")} aria-hidden="true" />
          {likeCount}
        </span>
        <span className="flex items-center gap-1" aria-label={`댓글 ${board.commentCount}개`}>
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          {board.commentCount}
        </span>
      </div>
      {error && <p role="alert" className="px-3 pb-3 text-xs text-destructive sm:px-4">{error}</p>}
    </article>
  );
}
