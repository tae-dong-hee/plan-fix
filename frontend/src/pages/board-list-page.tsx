import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  MessageSquare,
} from "lucide-react";

import AppNav from "@/components/ui/app-nav";
import StoryLikeButton from "@/components/ui/story-like-button";
import {
  fetchBoards,
  likeBoard,
  unlikeBoard,
  type BoardItem,
  type BoardSortType,
} from "@/services/board";
import { UnauthorizedError } from "@/services/spots";
import { fetchLikedBoards } from "@/services/wishlist";

const PAGE_SIZE = 12;
const FALLBACK_BOARD_IMAGE =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=85";

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  let start = Math.max(1, current - 2);
  const end = Math.min(total, start + 4);
  if (end - start < 4) {
    start = Math.max(1, end - 4);
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export default function BoardListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sort: BoardSortType = searchParams.get("sort") === "latest" ? "latest" : "popular";
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const currentPage = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const [boards, setBoards] = useState<BoardItem[] | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [boardsError, setBoardsError] = useState(false);
  const [boardsReload, setBoardsReload] = useState(0);
  const [likedBoards, setLikedBoards] = useState<Record<number, boolean>>({});
  const [loadingBoards, setLoadingBoards] = useState<Record<number, boolean>>({});
  const [boardLikesLoading, setBoardLikesLoading] = useState(true);
  const [boardLikesError, setBoardLikesError] = useState(false);
  const [boardLikeError, setBoardLikeError] = useState<string | null>(null);
  const pendingBoardLikes = useRef(new Set<number>());
  const boardLikeCounts = useRef<Record<number, number>>({});

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const pageNumbers = getPageNumbers(currentPage, totalPages);

  useEffect(() => {
    let ignore = false;
    setBoards(null);
    setBoardsError(false);

    fetchBoards({
      sort,
      size: PAGE_SIZE,
      offset: (currentPage - 1) * PAGE_SIZE,
    })
      .then((result) => {
        if (ignore) return;

        const lastPage = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE));
        if (currentPage > lastPage) {
          setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            if (lastPage === 1) next.delete("page");
            else next.set("page", String(lastPage));
            return next;
          }, { replace: true });
          return;
        }

        setBoards(result.items.map((board) => ({
          ...board,
          likeCount: boardLikeCounts.current[board.boardId] ?? board.likeCount,
        })));
        setTotalCount(result.totalCount);
      })
      .catch(() => {
        if (!ignore) setBoardsError(true);
      });

    return () => {
      ignore = true;
    };
  }, [sort, currentPage, boardsReload, setSearchParams]);

  useEffect(() => {
    let ignore = false;
    setBoardLikesLoading(true);
    setBoardLikesError(false);

    fetchLikedBoards()
      .then((items) => {
        if (!ignore) {
          setLikedBoards(Object.fromEntries(items.map((board) => [board.boardId, true])));
        }
      })
      .catch((error) => {
        if (ignore) return;
        if (error instanceof UnauthorizedError) setLikedBoards({});
        else setBoardLikesError(true);
      })
      .finally(() => {
        if (!ignore) setBoardLikesLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleSortChange = useCallback((nextSort: BoardSortType) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (nextSort === "popular") next.delete("sort");
      else next.set("sort", nextSort);
      next.delete("page");
      return next;
    });
  }, [setSearchParams]);

  const handlePageChange = useCallback((nextPage: number) => {
    if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage) return;

    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (nextPage === 1) next.delete("page");
      else next.set("page", String(nextPage));
      return next;
    });
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  }, [currentPage, setSearchParams, totalPages]);

  const handleToggleBoardLike = async (boardId: number) => {
    if (boardLikesLoading || boardLikesError || pendingBoardLikes.current.has(boardId)) return;

    const wasLiked = !!likedBoards[boardId];
    pendingBoardLikes.current.add(boardId);
    setBoardLikeError(null);
    setLoadingBoards((previous) => ({ ...previous, [boardId]: true }));

    try {
      const result = wasLiked ? await unlikeBoard(boardId) : await likeBoard(boardId);
      boardLikeCounts.current[boardId] = result.likeCount;
      setLikedBoards((previous) => ({ ...previous, [boardId]: result.liked }));
      setBoards((previous) => previous?.map((board) => (
        board.boardId === boardId ? { ...board, likeCount: result.likeCount } : board
      )) ?? previous);
    } catch (error) {
      if (error instanceof UnauthorizedError || (error instanceof Error && error.message === "로그인이 필요합니다.")) {
        navigate("/login");
      } else {
        setBoardLikeError("후기 좋아요를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      pendingBoardLikes.current.delete(boardId);
      setLoadingBoards((previous) => ({ ...previous, [boardId]: false }));
    }
  };

  return (
    <div className="app-page min-h-screen bg-background pb-28 text-foreground md:pb-16">
      <AppNav />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8 md:pb-0 md:pt-8 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/main")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="뒤로 가기"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">여행 후기</h1>
              <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">여행자들이 직접 남긴 강원도의 순간을 만나 보세요.</p>
            </div>
          </div>
          <Link
            to="/boards/create"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:text-sm"
          >
            후기 올리기
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <main className="app-page-content mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-5">
          <p className="text-[13px] leading-relaxed text-muted-foreground sm:text-sm">
            {boards !== null && !boardsError ? `총 ${totalCount.toLocaleString()}개의 후기` : "다양한 여행 후기를 둘러보세요."}
          </p>
          <div role="group" aria-label="여행 후기 정렬" className="flex rounded-full bg-muted p-1">
            {(["popular", "latest"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleSortChange(option)}
                aria-pressed={sort === option}
                className={`min-h-10 rounded-full px-4 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${sort === option ? "bg-primary/10 text-primary dark:bg-primary/5" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"}`}
              >
                {option === "popular" ? "인기순" : "최신순"}
              </button>
            ))}
          </div>
        </div>

        {boardLikeError && <p role="alert" className="mt-5 text-sm text-destructive">{boardLikeError}</p>}
        {boardLikesError && !boardsError && !!boards?.length && (
          <p role="alert" className="mt-5 text-sm text-muted-foreground">후기 좋아요 상태를 불러오지 못해 잠시 좋아요를 누를 수 없어요.</p>
        )}

        {boards === null && !boardsError ? (
          <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary motion-reduce:animate-none" aria-hidden="true" />
            여행 후기를 불러오는 중...
          </div>
        ) : boardsError ? (
          <div role="alert" className="flex min-h-64 flex-col items-center justify-center gap-4 text-center">
            <p className="text-base text-muted-foreground">여행 후기를 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => setBoardsReload((value) => value + 1)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              다시 시도
            </button>
          </div>
        ) : boards?.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-3xl bg-muted/40 px-6 text-center">
            <p className="text-base text-muted-foreground">아직 등록된 여행 후기가 없어요.</p>
            <Link to="/boards/create" className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              첫 후기 올리기
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {boards?.map((board) => (
                <article key={board.boardId} className="group overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md">
                  <Link
                    to={`/boards/${board.boardId}`}
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                      <img
                        src={board.thumbnail ?? FALLBACK_BOARD_IMAGE}
                        alt={board.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                      />
                      <span className="absolute left-4 top-4 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">여행 기록</span>
                    </div>
                    <div className="px-5 pb-4 pt-5">
                      <h2 className="line-clamp-2 min-h-12 text-base font-bold leading-relaxed tracking-tight transition-colors group-hover:text-primary">{board.title}</h2>
                      <time dateTime={board.createdAt} className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                        {formatDate(board.createdAt)}
                      </time>
                    </div>
                  </Link>
                  <div className="mx-5 flex flex-wrap items-center gap-3 border-t border-border/70 py-2">
                    <StoryLikeButton
                      title={board.title}
                      isLiked={!!likedBoards[board.boardId]}
                      likeCount={board.likeCount}
                      isLoading={boardLikesLoading || !!loadingBoards[board.boardId]}
                      disabled={boardLikesError}
                      onClick={() => handleToggleBoardLike(board.boardId)}
                      className="-ml-2"
                    />
                    <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-label={`댓글 ${board.commentCount}개`}>
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      {board.commentCount.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-label={`조회 ${board.viewCount}회`}>
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      {board.viewCount.toLocaleString()}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            {totalPages > 1 && (
              <nav aria-label="여행 후기 페이지네이션" className="mt-10 flex items-center justify-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10"
                  aria-label="이전 페이지"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                {pageNumbers.map((pageNumber) => {
                  const isCurrent = pageNumber === currentPage;
                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      onClick={() => handlePageChange(pageNumber)}
                      aria-current={isCurrent ? "page" : undefined}
                      className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors sm:h-10 sm:min-w-10 sm:px-3.5 ${isCurrent ? "bg-primary font-semibold text-primary-foreground shadow-sm" : "border border-border bg-background text-foreground hover:bg-muted"}`}
                    >
                      {pageNumber}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10"
                  aria-label="다음 페이지"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </>
        )}
      </main>
    </div>
  );
}
