import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Loader2,
  MapPin,
  Minus,
  Quote,
  Strikethrough,
} from "lucide-react";

import { SpotCardExtension, type SpotCardAttributes } from "./spot-card-extension";
import { uploadImageFile } from "@/services/image";
import { type CourseSpotSummary } from "@/services/course";
import { type PopularSpot } from "@/services/spots";

export interface BlogEditorProps {
  initialContent?: string;
  onChange?: (html: string) => void;
  onOpenSpotSearch?: () => void;
  courseSpots?: CourseSpotSummary[];
  editorInstanceRef?: React.MutableRefObject<Editor | null>;
}

export default function BlogEditor({
  initialContent = "",
  onChange,
  onOpenSpotSearch,
  courseSpots = [],
  editorInstanceRef,
}: BlogEditorProps) {
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 이미지 업로드 공통 처리
  const handleUploadAndInsert = useCallback(
    async (file: File, editor: Editor) => {
      try {
        setIsUploadingImage(true);
        const result = await uploadImageFile(file);
        editor
          .chain()
          .focus()
          .setImage({ src: result.imageUrl, alt: file.name.replace(/\.[^/.]+$/, "") })
          .run();
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "이미지 업로드에 실패했습니다.";
        alert(errorMsg);
      } finally {
        setIsUploadingImage(false);
      }
    },
    []
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Image.configure({
        inline: false,
        HTMLAttributes: {
          class: "rounded-2xl max-w-full my-6 shadow-md mx-auto block object-cover",
        },
      }),
      Placeholder.configure({
        placeholder:
          "여정의 시작부터 특별했던 순간들을 자유롭게 기록해 보세요.\n사진을 드래그하거나 [사진 추가]를 눌러 본문 중간에 넣을 수 있고, [장소 카드]로 다녀온 스팟을 첨부할 수 있어요.",
      }),
      SpotCardExtension,
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "travel-story-content prose prose-lg max-w-none focus:outline-none min-h-[400px] px-4 py-6 sm:px-8 text-foreground leading-relaxed",
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
          const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
          if (files.length > 0) {
            event.preventDefault();
            files.forEach((file) => {
              if (editor) {
                handleUploadAndInsert(file, editor);
              }
            });
            return true;
          }
        }
        return false;
      },
      handlePaste: (view, event) => {
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
          const files = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (files.length > 0) {
            event.preventDefault();
            files.forEach((file) => {
              if (editor) {
                handleUploadAndInsert(file, editor);
              }
            });
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange?.(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (editorInstanceRef) {
      editorInstanceRef.current = editor;
    }
  }, [editor, editorInstanceRef]);

  // 툴바 파일 선택 이벤트
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !editor) return;

    for (let i = 0; i < files.length; i++) {
      await handleUploadAndInsert(files[i], editor);
    }
    // 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 장소 카드 삽입
  const insertSpot = useCallback(
    (spot: PopularSpot | CourseSpotSummary) => {
      if (!editor) return;
      const address =
        "address" in spot && spot.address
          ? spot.address
          : [spot.region, spot.sigungu].filter(Boolean).join(" ");
      const imageUrl = spot.thumbnail || "";
      const attrs: SpotCardAttributes = {
        spotId: spot.spotId,
        title: spot.title,
        address: address || "위치 정보 없음",
        category: spot.category || "여행지",
        imageUrl,
      };
      editor.chain().focus().insertSpotCard(attrs).run();
    },
    [editor]
  );

  if (!editor) {
    return (
      <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/80 bg-card shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
      {/* 상단 툴바 */}
      <div className="sticky top-16 z-20 flex flex-wrap items-center justify-between gap-1.5 border-b border-border/70 bg-card/95 px-4 py-2.5 backdrop-blur-md">
        {/* 서식 도구들 */}
        <div className="flex flex-wrap items-center gap-1">
          {/* H2 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
              editor.isActive("heading", { level: 2 })
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="대제목 (H2)"
            aria-label="대제목"
          >
            <Heading2 className="h-4 w-4" />
          </button>

          {/* H3 */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
              editor.isActive("heading", { level: 3 })
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="소제목 (H3)"
            aria-label="소제목"
          >
            <Heading3 className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px bg-border/80" />

          {/* Bold */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
              editor.isActive("bold")
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="굵게 (Ctrl+B)"
            aria-label="굵게"
          >
            <Bold className="h-4 w-4" />
          </button>

          {/* Italic */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
              editor.isActive("italic")
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="기울임 (Ctrl+I)"
            aria-label="기울임"
          >
            <Italic className="h-4 w-4" />
          </button>

          {/* Strike */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
              editor.isActive("strike")
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="취소선"
            aria-label="취소선"
          >
            <Strikethrough className="h-4 w-4" />
          </button>

          {/* Blockquote */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
              editor.isActive("blockquote")
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="인용구"
            aria-label="인용구"
          >
            <Quote className="h-4 w-4" />
          </button>

          <div className="mx-1 h-4 w-px bg-border/80" />

          {/* Bullet List */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
              editor.isActive("bulletList")
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="글머리 기호 목록"
            aria-label="글머리 기호 목록"
          >
            <List className="h-4 w-4" />
          </button>

          {/* Ordered List */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors ${
              editor.isActive("orderedList")
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="번호 매기기 목록"
            aria-label="번호 목록"
          >
            <ListOrdered className="h-4 w-4" />
          </button>

          {/* Divider */}
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="구분선 삽입"
            aria-label="구분선 삽입"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {/* 미디어 / 장소 첨부 버튼들 */}
        <div className="flex items-center gap-2">
          {/* 사진 추가 버튼 */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingImage}
            className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            {isUploadingImage ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <ImageIcon className="h-3.5 w-3.5 text-primary" />
            )}
            <span>사진 추가</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />

          {/* 장소 카드 추가 버튼 */}
          {onOpenSpotSearch && (
            <button
              type="button"
              onClick={onOpenSpotSearch}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <MapPin className="h-3.5 w-3.5" />
              <span>장소 카드 첨부</span>
            </button>
          )}
        </div>
      </div>

      {/* 연계 코스 장소 빠른 추가 칩 바 */}
      {courseSpots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-primary/5 px-4 py-2.5 text-xs">
          <span className="flex items-center gap-1 font-semibold text-primary shrink-0">
            <MapPin className="h-3.5 w-3.5" />
            코스 장소 퀵 추가:
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {courseSpots.map((s) => (
              <button
                key={s.spotId}
                type="button"
                onClick={() => insertSpot(s)}
                className="flex items-center gap-1 rounded-full border border-primary/20 bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary shadow-2xs"
                title={`${s.title} 장소 카드를 본문에 삽입`}
              >
                <span>+ {s.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 업로드 중 플로팅 알림 */}
      {isUploadingImage && (
        <div className="flex items-center justify-center gap-2 bg-primary/10 py-1.5 text-xs font-medium text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>선택하신 사진을 AWS S3에 안전하게 업로드하고 있습니다...</span>
        </div>
      )}

      {/* 에디터 본문 영역 */}
      <EditorContent editor={editor} />
    </div>
  );
}
