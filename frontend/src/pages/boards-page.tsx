import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, PenLine, RefreshCw } from "lucide-react";

import AppNav from "@/components/ui/app-nav";
import BoardCard from "@/components/ui/board-card";
import { LoaderFour } from "@/components/ui/unique-loader-components";
import { fetchBoards, type BoardListResult } from "@/services/board";

const PAGE_SIZE = 20;
const SORT_OPTIONS = [
  { value: "popular", label: "인기순" },
  { value: "latest", label: "최신순" },
] as const;

function getPageNumbers(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export default function BoardsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = searchParams.get("sort") === "latest" ? "latest" : "popular";
  const rawPage = Number(searchParams.get("page") ?? "1");
  const currentPage =
    Number.isSafeInteger(rawPage) && rawPage > 0 && Number.isSafeInteger((rawPage - 1) * PAGE_SIZE)
      ? rawPage
      : 1;
  const [result, setResult] = useState<BoardListResult | null>(null);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const totalPages = Math.ceil((result?.totalCount ?? 0) / PAGE_SIZE);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [currentPage, sort]);

  useEffect(() => {
    let ignore = false;
    setResult(null);
    setHasError(false);

    fetchBoards({ sort, size: PAGE_SIZE, offset: (currentPage - 1) * PAGE_SIZE })
      .then((response) => {
        if (ignore) return;

        const lastPage = Math.max(1, Math.ceil(response.totalCount / PAGE_SIZE));
        if (currentPage > lastPage) {
          setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            if (lastPage === 1) next.delete("page");
            else next.set("page", String(lastPage));
            return next;
          }, { replace: true });
          return;
        }

        setResult(response);
      })
      .catch(() => {
        if (!ignore) setHasError(true);
      });

    return () => {
      ignore = true;
    };
  }, [sort, currentPage, retryCount, setSearchParams]);

  const changeSort = (nextSort: "popular" | "latest") => {
    if (nextSort === sort) return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("sort", nextSort);
      next.delete("page");
      return next;
    });
  };

  const changePage = (page: number) => {
    if (page < 1 || page > totalPages || page === currentPage) return;
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      if (page === 1) next.delete("page");
      else next.set("page", String(page));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground md:pb-16 md:pt-16">
      <AppNav />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8 md:pb-0 md:pt-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/main")}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label="뒤로 가기"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">여행 이야기</h1>
          </div>

          <Link
            to="/boards/create"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:text-sm"
          >
            <PenLine className="h-4 w-4" aria-hidden="true" />
            이야기 쓰기
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pt-8 sm:px-8 md:pt-6 lg:px-10">
        <p className="text-sm text-muted-foreground sm:text-base">
          다른 여행자의 경험에서 나만의 여행을 발견해 보세요.
        </p>

        <div className="mb-6 mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {result ? <>총 <span className="font-semibold text-foreground">{result.totalCount.toLocaleString()}</span>개의 여행 이야기</> : null}
          </p>
          <div role="group" aria-label="여행 이야기 정렬" className="flex gap-2">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeSort(option.value)}
                aria-pressed={sort === option.value}
                className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-sm ${
                  sort === option.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/50 text-foreground hover:bg-muted"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {hasError ? (
          <div role="alert" className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="text-base text-muted-foreground">여행 이야기를 불러오지 못했어요.</p>
            <button
              type="button"
              onClick={() => setRetryCount((previous) => previous + 1)}
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              다시 시도
            </button>
          </div>
        ) : result === null ? (
          <div className="flex justify-center py-24">
            <LoaderFour text="여행 이야기를 불러오는 중..." />
          </div>
        ) : result.items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24 text-center">
            <p className="text-base text-muted-foreground">아직 등록된 여행 이야기가 없어요.</p>
            <p className="text-sm text-muted-foreground">첫 여행 이야기를 들려주세요.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {result.items.map((board) => <BoardCard key={board.boardId} board={board} />)}
            </div>

            {totalPages > 1 ? (
              <nav aria-label="페이지네이션" className="mt-10 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => changePage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="이전 페이지"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                {getPageNumbers(currentPage, totalPages).map((page) => (
                  <button
                    key={page}
                    type="button"
                    onClick={() => changePage(page)}
                    aria-current={page === currentPage ? "page" : undefined}
                    className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors sm:h-10 sm:min-w-10 sm:px-3.5 ${
                      page === currentPage
                        ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                        : "border border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => changePage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  aria-label="다음 페이지"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40 sm:h-10 sm:w-10"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
