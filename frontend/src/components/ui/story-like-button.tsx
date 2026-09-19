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
      aria-label={`${title} 좋아요`}
      aria-pressed={isLiked}
      aria-busy={isLoading}
      className={cn(
        "inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60",
        isLiked
          ? "text-primary hover:bg-primary/10"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      ) : (
        <Heart className={cn("h-3.5 w-3.5", isLiked && "fill-current")} strokeWidth={1.8} aria-hidden="true" />
      )}
      <span>좋아요</span>
      <span className="font-semibold tabular-nums" aria-label={`좋아요 ${likeCount.toLocaleString()}개`}>
        {likeCount.toLocaleString()}
      </span>
    </button>
  );
}
