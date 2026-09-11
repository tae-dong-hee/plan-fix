import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  Eye,
  Heart,
  MessageSquare,
  Pencil,
  Reply,
  Route as RouteIcon,
  Trash2,
  X,
} from "lucide-react";

import AppNav from "@/components/ui/app-nav";
import { LoaderFour } from "@/components/ui/unique-loader-components";
import { createBoardComment, deleteBoardComment, fetchBoardComments, fetchBoardDetail, likeBoard, unlikeBoard, updateBoardComment, type BoardComment, type BoardDetail } from "@/services/board";
import { fetchCourse, type CourseResponse } from "@/services/course";
import { fetchMyProfile } from "@/services/user";

const FALLBACK_BOARD_IMAGE =
  "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=85";

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return dateString;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}.${month}.${day}`;
  } catch {
    return dateString;
  }
}

/**
 * 백엔드에서 XSS 위험 요소(<script>, <iframe> 등)가 이미 필터링된 안전한 본문 HTML을
 * 일반 텍스트일 때도 줄바꿈이 유지되도록 가공한다.
 */
function formatContentHtml(content: string): string {
  if (!content) return "";
  // 이미 HTML 태그가 포함되어 있다면 그대로 사용하고, 단순 텍스트면 줄바꿈을 <br />로 변환
  const hasHtmlTag = /<[a-z][\s\S]*>/i.test(content);
  if (hasHtmlTag) {
    return content;
  }
  return content.replace(/\n/g, "<br />");
}

export default function BoardDetailPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  // undefined = 로딩 중, null = 없음(404) 또는 에러
  const [board, setBoard] = useState<BoardDetail | null | undefined>(undefined);
  const [linkedCourse, setLinkedCourse] = useState<CourseResponse | null>(null);
  const [isTogglingLike, setIsTogglingLike] = useState(false);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [commentNotice, setCommentNotice] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [replyToId, setReplyToId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [commentActionId, setCommentActionId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  useEffect(() => {
    if (!board?.courseId) {
      setLinkedCourse(null);
      return;
    }

    let cancelled = false;
    fetchCourse(board.courseId)
      .then((data) => {
        if (!cancelled && data) {
          setLinkedCourse(data);
        }
      })
      .catch((err) => {
        console.warn("연계된 코스를 불러오지 못했습니다:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [board?.courseId]);

  const inFlightRequest = useRef<{ boardId: string; promise: Promise<BoardDetail | null> } | null>(null);

  useEffect(() => {
    const currentBoardId = boardId ?? "";
    let cancelled = false;
    setBoard(undefined);

    let request = inFlightRequest.current;
    if (!request || request.boardId !== currentBoardId) {
      request = { boardId: currentBoardId, promise: fetchBoardDetail(currentBoardId) };
      inFlightRequest.current = request;
    }
    const { promise } = request;

    promise
      .then((result) => {
        if (!cancelled) {
          setBoard(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBoard(null);
        }
      })
      .finally(() => {
        if (inFlightRequest.current === request) {
          inFlightRequest.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardId]);

  useEffect(() => {
    Promise.resolve(fetchMyProfile()).then((profile) => setCurrentUserId(profile?.userId ?? null)).catch(() => setCurrentUserId(null));
  }, []);

  useEffect(() => {
    if (!boardId) return;
    Promise.resolve(fetchBoardComments(boardId) ?? []).then((result) => setComments(result ?? [])).catch(() => setComments([]));
  }, [boardId]);

  const submitComment = async () => {
    if (!boardId || !commentText.trim() || isCommentSubmitting) return;
    setIsCommentSubmitting(true);
    setCommentNotice(null);
    try {
      const comment = await createBoardComment(boardId, commentText.trim());
      setComments((current) => [...current, comment]);
      setCommentText("");
      setBoard((current) => current ? { ...current, commentCount: current.commentCount + 1 } : current);
    } catch (error) {
      setCommentNotice(error instanceof Error ? error.message : "댓글을 등록하지 못했습니다.");
    } finally {
      setIsCommentSubmitting(false);
    }
  };

  const submitReply = async (parentCommentId: number) => {
    if (!boardId || !replyText.trim() || commentActionId !== null) return;
    setCommentActionId(parentCommentId);
    setCommentNotice(null);
    try {
      const reply = await createBoardComment(boardId, replyText.trim(), parentCommentId);
      setComments((current) => [...current, reply]);
      setReplyText("");
      setReplyToId(null);
      setBoard((current) => current ? { ...current, commentCount: current.commentCount + 1 } : current);
    } catch (error) {
      setCommentNotice(error instanceof Error ? error.message : "대댓글을 등록하지 못했습니다.");
    } finally {
      setCommentActionId(null);
    }
  };

  const saveCommentEdit = async (commentId: number) => {
    if (!boardId || !editingText.trim() || commentActionId !== null) return;
    setCommentActionId(commentId);
    setCommentNotice(null);
    try {
      const updated = await updateBoardComment(boardId, commentId, editingText.trim());
      setComments((current) => current.map((comment) => comment.commentId === commentId ? updated : comment));
      setEditingCommentId(null);
      setEditingText("");
    } catch (error) {
      setCommentNotice(error instanceof Error ? error.message : "댓글을 수정하지 못했습니다.");
    } finally {
      setCommentActionId(null);
    }
  };

  const removeComment = async (commentId: number) => {
    if (!boardId || commentActionId !== null) return;
    setCommentActionId(commentId);
    setCommentNotice(null);
    try {
      await deleteBoardComment(boardId, commentId);
      setComments((current) => current.filter((comment) => comment.commentId !== commentId));
      setDeleteConfirmId(null);
      setBoard((current) => current ? { ...current, commentCount: Math.max(0, current.commentCount - 1) } : current);
    } catch (error) {
      setCommentNotice(error instanceof Error ? error.message : "댓글을 삭제하지 못했습니다.");
    } finally {
      setCommentActionId(null);
    }
  };

  const handleGoBack = () => {
    navigate("/main");
  };

  const toggleLike = async () => {
    if (!board || isTogglingLike) {
      return;
    }

    const previousBoard = board;
    const nextLiked = !board.isLiked;
    const nextLikeCount = nextLiked
      ? board.likeCount + 1
      : Math.max(0, board.likeCount - 1);

    // 즉시 UI 반영 (Optimistic Update)
    setBoard({ ...board, isLiked: nextLiked, likeCount: nextLikeCount });
    setIsTogglingLike(true);

    try {
      const result = previousBoard.isLiked
        ? await unlikeBoard(previousBoard.boardId)
        : await likeBoard(previousBoard.boardId);
      setBoard({ ...previousBoard, isLiked: result.liked, likeCount: result.likeCount });
    } catch (error: unknown) {
      setBoard(previousBoard);
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("로그인") || msg.includes("인증")) {
        if (confirm("로그인이 필요한 기능입니다. 로그인 페이지로 이동하시겠습니까?")) {
          navigate("/login");
        }
      }
    } finally {
      setIsTogglingLike(false);
    }
  };

  const heroImage =
    board?.thumbnail || (board?.images && board.images.length > 0 ? board.images[0].imageUrl : null) || FALLBACK_BOARD_IMAGE;

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground md:pb-16 md:pt-16">
      <AppNav />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md md:static md:z-auto md:border-b-0 md:bg-transparent md:backdrop-blur-none">
        <div className="mx-auto flex max-w-3xl items-center px-5 py-4 sm:px-8">
          <button
            type="button"
            onClick={handleGoBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary/10 hover:text-primary"
            aria-label="뒤로 가기"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {board === undefined ? (
        <div className="flex justify-center py-24">
          <LoaderFour text="게시글을 불러오는 중..." />
        </div>
      ) : board === null ? (
        <div className="flex flex-col items-center justify-center gap-4 px-5 py-24 text-center">
          <p className="text-base text-muted-foreground">게시글을 찾을 수 없어요.</p>
          <button
            type="button"
            onClick={handleGoBack}
            className="rounded-full bg-muted px-5 py-3 text-sm font-semibold transition-colors hover:bg-primary/10 hover:text-primary"
          >
            홈으로 돌아가기
          </button>
        </div>
      ) : (
        <main className="mx-auto max-w-3xl px-5 pb-16 sm:px-8">
          <article className="overflow-hidden">
            {/* 히어로 이미지 */}
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-muted shadow-panel sm:aspect-[16/9]">
              <img
                src={heroImage}
                alt={board.title}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={toggleLike}
                disabled={isTogglingLike}
                className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-md transition-all hover:scale-105 hover:bg-black/60 active:scale-95 disabled:opacity-60"
                aria-pressed={board.isLiked}
                aria-label={board.isLiked ? `${board.title} 좋아요 취소` : `${board.title} 좋아요`}
              >
                <Heart
                  className={`h-6 w-6 transition-colors ${
                    board.isLiked ? "fill-rose-500 text-rose-500" : "text-white/90"
                  }`}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* 헤더 메타데이터 영역 */}
            <div className="mt-6 sm:mt-8">
              <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary sm:text-sm">
                여행 이야기
              </span>

              <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                {board.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-y-2 text-xs text-muted-foreground sm:text-sm">
                <span className="flex items-center gap-1.5 font-medium">
                  <Calendar className="h-4 w-4 text-muted-foreground/80" aria-hidden="true" />
                  <time dateTime={board.createdAt}>{formatDate(board.createdAt)}</time>
                </span>

                <span className="mx-2.5 select-none text-muted-foreground/40">·</span>

                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1" title="조회수">
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    <span>조회 {board.viewCount.toLocaleString()}</span>
                  </span>

                  <button
                    type="button"
                    onClick={toggleLike}
                    disabled={isTogglingLike}
                    className={`flex items-center gap-1 font-medium transition-colors hover:opacity-80 active:scale-95 disabled:opacity-60 ${
                      board.isLiked ? "text-red-500" : "text-muted-foreground hover:text-red-500"
                    }`}
                    title={board.isLiked ? "좋아요 취소" : "좋아요"}
                  >
                    <Heart
                      className="h-4 w-4"
                      fill={board.isLiked ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                    <span>좋아요 {board.likeCount.toLocaleString()}</span>
                  </button>

                  <span className="flex items-center gap-1" title="댓글 수">
                    <MessageSquare className="h-4 w-4 text-primary/80" aria-hidden="true" />
                    <span>댓글 {board.commentCount.toLocaleString()}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* 연계된 여행 코스 카드 */}
            {linkedCourse && (
              <section
                aria-label="연계된 여행 코스"
                className="mt-8 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-background p-5 sm:p-6 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
                        <RouteIcon className="h-3.5 w-3.5" />
                        추천 여행 코스
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {linkedCourse.days.length}일 코스
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-foreground sm:text-xl">
                      {linkedCourse.title}
                    </h2>
                    {linkedCourse.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                        {linkedCourse.description}
                      </p>
                    )}
                  </div>

                  <Link
                    to={`/courses/${linkedCourse.courseId}`}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow transition-transform hover:opacity-95 active:scale-95"
                  >
                    <span>코스 전체 일정 보기</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* Day별 주요 방문 장소 미리보기 */}
                {linkedCourse.days.some((d) => d.spots.length > 0) && (
                  <div className="mt-4 border-t border-border/70 pt-3">
                    <p className="mb-2 text-[11px] font-semibold text-muted-foreground">코스 요약</p>
                    <div className="space-y-2">
                      {linkedCourse.days.map((day) => {
                        if (day.spots.length === 0) return null;
                        return (
                          <div key={day.dayNumber} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-bold text-foreground">Day {day.dayNumber}:</span>
                            {day.spots.map((s, idx) => (
                              <span key={s.spotId} className="flex items-center gap-1 text-muted-foreground">
                                <span className="font-medium text-foreground">{s.title}</span>
                                {idx < day.spots.length - 1 && <span className="text-primary/60">→</span>}
                              </span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 본문 콘텐츠 */}
            <div
              className="travel-story-content mt-8 border-t border-border/70 pt-8 text-base leading-relaxed text-foreground/90 break-words sm:text-lg sm:leading-loose
                [&_p]:mb-4 [&_p]:leading-relaxed
                [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-foreground
                [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground
                [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground
                [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6
                [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6
                [&_li]:my-1.5
                [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/50 [&_blockquote]:bg-muted/40 [&_blockquote]:py-2 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
                [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:opacity-80
                [&_img]:my-6 [&_img]:max-w-full [&_img]:rounded-xl [&_img]:shadow-sm
                [&_strong]:font-semibold [&_strong]:text-foreground"
              dangerouslySetInnerHTML={{ __html: formatContentHtml(board.content) }}
            />

            {/* 추가 사진 갤러리 (이미지가 2장 이상이거나 이미지가 존재할 때) */}
            {board.images && board.images.length > 0 && (
              <section className="mt-12 border-t border-border/70 pt-8" aria-label="게시글 사진 갤러리">
                <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                  사진 갤러리 <span className="text-sm font-normal text-muted-foreground">({board.images.length})</span>
                </h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                  {board.images.map((img, idx) => (
                    <div
                      key={`${img.imageUrl}-${idx}`}
                      className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-border/60 bg-muted shadow-panel"
                    >
                      <img
                        src={img.imageUrl}
                        alt={img.altText || `${board.title} 사진 ${idx + 1}`}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-12 border-t border-border/70 pt-8" aria-label="댓글">
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight sm:text-xl">
                <MessageSquare className="h-5 w-5 text-primary" /> 댓글 <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
              </h2>
              <div className="mt-4 flex gap-2">
                <input value={commentText} onChange={(event) => setCommentText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitComment(); }} placeholder="댓글을 남겨보세요" maxLength={1000} className="min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                <button type="button" onClick={() => void submitComment()} disabled={!commentText.trim() || isCommentSubmitting} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">등록</button>
              </div>
              {commentNotice && <p className="mt-2 text-sm text-destructive" role="alert">{commentNotice}</p>}
              <div className="mt-4 space-y-3">
                {comments.length === 0 ? <p className="py-4 text-sm text-muted-foreground">첫 댓글을 남겨보세요.</p> : comments.filter((comment) => comment.parentCommentId === null).map((comment) => {
                  const children = comments.filter((child) => child.parentCommentId === comment.commentId);
                  const renderComment = (item: BoardComment, depth = 0) => (
                    <div key={item.commentId} className={depth > 0 ? "ml-6 border-l-2 border-primary/20 pl-4" : ""}>
                      <div className="rounded-xl bg-muted/40 px-4 py-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground">{item.authorName || `사용자 #${item.userId}`}</span>
                          <time className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</time>
                        </div>
                        {editingCommentId === item.commentId ? (
                          <div className="mt-2 flex gap-2">
                            <input value={editingText} onChange={(event) => setEditingText(event.target.value)} maxLength={1000} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" autoFocus />
                            <button type="button" onClick={() => void saveCommentEdit(item.commentId)} disabled={!editingText.trim() || commentActionId !== null} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">저장</button>
                            <button type="button" onClick={() => { setEditingCommentId(null); setEditingText(""); }} className="rounded-lg border border-border px-2" aria-label="수정 취소"><X className="h-4 w-4" /></button>
                          </div>
                        ) : <p className="mt-2 whitespace-pre-wrap break-words">{item.content}</p>}
                        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                          <button type="button" onClick={() => { setReplyToId(item.commentId); setReplyText(""); }} className="inline-flex items-center gap-1 hover:text-primary"><Reply className="h-3.5 w-3.5" />대댓글</button>
                          {currentUserId === item.userId && editingCommentId !== item.commentId && <button type="button" onClick={() => { setEditingCommentId(item.commentId); setEditingText(item.content); }} className="inline-flex items-center gap-1 hover:text-primary"><Pencil className="h-3.5 w-3.5" />수정</button>}
                          {currentUserId === item.userId && <button type="button" onClick={() => setDeleteConfirmId(item.commentId)} disabled={commentActionId !== null} className="inline-flex items-center gap-1 hover:text-destructive disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />삭제</button>}
                        </div>
                        {deleteConfirmId === item.commentId && <div className="mt-3 flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs"><span>댓글을 삭제할까요?</span><span className="flex gap-2"><button type="button" onClick={() => void removeComment(item.commentId)} disabled={commentActionId !== null} className="rounded-md bg-destructive px-2.5 py-1.5 font-semibold text-destructive-foreground disabled:opacity-50">삭제</button><button type="button" onClick={() => setDeleteConfirmId(null)} className="rounded-md border border-border px-2.5 py-1.5">취소</button></span></div>}
                        {replyToId === item.commentId && <div className="mt-3 flex gap-2"><input value={replyText} onChange={(event) => setReplyText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitReply(item.commentId); }} placeholder="대댓글을 남겨보세요" maxLength={1000} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" autoFocus /><button type="button" onClick={() => void submitReply(item.commentId)} disabled={!replyText.trim() || commentActionId !== null} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">등록</button></div>}
                      </div>
                      {comments.filter((child) => child.parentCommentId === item.commentId).map((child) => renderComment(child, depth + 1))}
                    </div>
                  );
                  return renderComment(comment);
                })}
              </div>
            </section>
          </article>
        </main>
      )}
    </div>
  );
}
