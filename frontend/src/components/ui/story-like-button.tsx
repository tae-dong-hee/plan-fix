import { Heart, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type StoryLikeButtonProps = {
  title: string;
  isLiked: boolean;
  likeCount: number;
  isLoading?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
};

export default function StoryLikeButton({
  title,
  isLiked,
  likeCount,
  isLoading = false,
  disabled = false,
  onClick,
  className,
}: StoryLikeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-label={`${title} ${isLiked ? "좋아요 취소" : "좋아요"}`}
      aria-pressed={isLiked}
      aria-busy={isLoading}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60",
        isLiked
          ? "border-primary/25 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/15"
          : "border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary",
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Heart className={cn("h-4 w-4", isLiked && "fill-current")} aria-hidden="true" />
      )}
      <span>{isLiked ? "좋아요 취소" : "좋아요"}</span>
      <span className="border-l border-current/20 pl-2 tabular-nums" aria-label={`좋아요 ${likeCount.toLocaleString()}개`}>
        {likeCount.toLocaleString()}
      </span>
    </button>
  );
}
