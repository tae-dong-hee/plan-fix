import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Camera,
  ChevronLeft,
  ImageIcon,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { type Editor } from "@tiptap/react";

import AppNav from "@/components/ui/app-nav";
import BlogEditor from "@/components/editor/blog-editor";
import SpotSearchModal from "@/components/ui/spot-search-modal";
import MyCoursePicker from "@/components/ui/my-course-picker";
import { createBoard, type CreateBoardPayload } from "@/services/board";
import { fetchMyCourses, type CourseResponse, type CourseSpotSummary } from "@/services/course";
import { uploadImageFile } from "@/services/image";
import { UnauthorizedError, type PopularSpot } from "@/services/spots";

export default function BoardCreatePage() {
  const navigate = useNavigate();

  // 커버 및 기본 메타 정보
  const [title, setTitle] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // 연동 코스
  const [myCourses, setMyCourses] = useState<CourseResponse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [coursesReloadKey, setCoursesReloadKey] = useState(0);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  // 본문 HTML 및 TipTap 에디터 인스턴스
  const [contentHtml, setContentHtml] = useState("");
  const editorRef = useRef<Editor | null>(null);

  // 장소 검색 모달
  const [isSpotSearchOpen, setIsSpotSearchOpen] = useState(false);

  // 발행 상태
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 내 코스 목록 불러오기
  useEffect(() => {
    let cancelled = false;
    setCoursesLoading(true);
    setCoursesError(null);
    fetchMyCourses()
      .then((courses) => {
        if (!cancelled) {
          setMyCourses(courses || []);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCoursesError(err instanceof UnauthorizedError
            ? "내 코스를 보려면 로그인이 필요해요."
            : "내 코스를 불러오지 못했어요. 다시 시도해 주세요.");
        }
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coursesReloadKey]);

  // 선택된 코스의 장소들 추출
  const selectedCourse = myCourses.find((c) => c.courseId === selectedCourseId) || null;
  const courseSpots: CourseSpotSummary[] = selectedCourse
    ? selectedCourse.days.flatMap((d) => d.spots)
    : [];

  // 커버 이미지 업로드 핸들러
  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCoverUploading(true);
      const res = await uploadImageFile(file);
      setCoverImage(res.imageUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "커버 사진 업로드에 실패했습니다.";
      alert(msg);
    } finally {
      setIsCoverUploading(false);
      if (coverFileInputRef.current) {
        coverFileInputRef.current.value = "";
      }
    }
  };

  // 장소 검색 모달에서 장소 선택 시 에디터에 카드 삽입
  const handleSelectSpot = (spot: PopularSpot) => {
    if (editorRef.current) {
      const address = [spot.region, spot.sigungu].filter(Boolean).join(" ");
      editorRef.current.chain().focus().insertSpotCard({
        spotId: spot.spotId,
        title: spot.title,
        address: address || "위치 정보 없음",
        category: spot.category || "여행지",
        imageUrl: spot.thumbnail || "",
      }).run();
    }
    setIsSpotSearchOpen(false);
  };

  // 본문 HTML에서 이미지 URL 추출
  const extractImageUrls = (html: string): string[] => {
    const urls: string[] = [];
    const regex = /<img[^>]+src=["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      if (match[1] && !urls.includes(match[1])) {
        urls.push(match[1]);
      }
    }
    return urls;
  };

  // 게시글 발행
  const handleSubmit = async () => {
    if (!title.trim()) {
      alert("여행기 제목을 입력해 주세요.");
      return;
    }

    const currentEditor = editorRef.current;
    const currentHtml = currentEditor ? currentEditor.getHTML() : contentHtml;
    const textOnly = currentEditor ? currentEditor.getText().trim() : "";
    const extractedImages = extractImageUrls(currentHtml);

    if (!textOnly && extractedImages.length === 0) {
      alert("여행기 내용을 작성해 주세요.");
      return;
    }

    // 전체 이미지 목록 (커버 사진 + 본문 삽입 이미지)
    const allImages = [...extractedImages];
    if (coverImage && !allImages.includes(coverImage)) {
      allImages.unshift(coverImage);
    }

    const payload: CreateBoardPayload = {
      title: title.trim(),
      content: currentHtml,
      thumbnail: coverImage || (extractedImages.length > 0 ? extractedImages[0] : null),
      courseId: selectedCourseId,
      images: allImages.map((url) => ({ imageUrl: url })),
    };

    try {
      setIsSubmitting(true);
      setSubmitError(null);
      const res = await createBoard(payload);
      navigate(`/boards/${res.boardId}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "게시글 등록 중 오류가 발생했습니다.";
      setSubmitError(msg);
      alert(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-32 text-foreground md:pb-20 md:pt-16">
      <AppNav />

      {/* 상단 액션바 */}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-colors hover:bg-primary/10 hover:text-primary"
              aria-label="뒤로 가기"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-bold text-foreground sm:text-lg">여행기 작성</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                당신의 소중한 여행 이야기를 자유롭게 기록해 보세요
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:opacity-90 hover:shadow-md disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>발행 중...</span>
                </>
              ) : (
                <span>발행하기</span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 sm:pt-8">
        {/* 에러 알림 */}
        {submitError && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
            {submitError}
          </div>
        )}

        <div className="space-y-6">
          {/* 1. 대표 커버 사진 */}
          <div className="group relative">
            {coverImage ? (
              <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl border border-border bg-muted shadow-sm sm:aspect-[24/9]">
                <img
                  src={coverImage}
                  alt="여행기 커버 사진"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => coverFileInputRef.current?.click()}
                    className="flex items-center gap-1 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>커버 사진 변경</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoverImage("")}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-destructive hover:text-white"
                    aria-label="커버 사진 삭제"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => coverFileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-muted/30 py-8 px-4 text-center transition-all hover:border-primary/50 hover:bg-muted/50"
              >
                {isCoverUploading ? (
                  <div className="flex flex-col items-center gap-2 text-primary">
                    <Loader2 className="h-7 w-7 animate-spin" />
                    <span className="text-xs font-medium">커버 사진 업로드 중...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">
                      대표 커버 사진 추가 <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      클릭하여 사진을 업로드하세요 (JPG, PNG, WebP 지원)
                    </p>
                  </>
                )}
              </div>
            )}
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleCoverUpload}
            />
          </div>

          {/* 2. 제목 입력 */}
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="여행기 제목을 입력하세요 (예: 2박 3일 낭만 제주 뚜벅이 여행기)"
              className="w-full border-b border-border/80 bg-transparent px-1 py-3 text-2xl font-extrabold text-foreground placeholder:text-muted-foreground/40 focus:border-primary focus:outline-none sm:text-3xl"
              maxLength={100}
            />
          </div>

          {/* 3. 내 여행 코스 연결 */}
          <MyCoursePicker
            courses={myCourses}
            value={selectedCourseId}
            onChange={setSelectedCourseId}
            loading={coursesLoading}
            error={coursesError}
            onRetry={() => setCoursesReloadKey((key) => key + 1)}
          />

          {/* 4. 블로그형 리치 텍스트 에디터 */}
          <div>
            <BlogEditor
              initialContent={contentHtml}
              onChange={setContentHtml}
              onOpenSpotSearch={() => setIsSpotSearchOpen(true)}
              courseSpots={courseSpots}
              editorInstanceRef={editorRef}
            />
          </div>
        </div>
      </main>

      {/* 장소 검색 모달 */}
      <SpotSearchModal
        open={isSpotSearchOpen}
        onClose={() => setIsSpotSearchOpen(false)}
        onSelect={handleSelectSpot}
      />
    </div>
  );
}
