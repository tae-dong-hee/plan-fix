import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { type Editor } from "@tiptap/react";
import { Check, ImagePlus, Loader2, PenLine, RefreshCw, Sparkles, X } from "lucide-react";
import { generateBoardDraft, MAX_STORY_PHOTOS, validateStoryPhotos } from "@/services/board-ai";
import "./story-writing-assistant.css";

interface Props {
  title: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  onBusyChange: (busy: boolean) => void;
  editorRef: MutableRefObject<Editor | null>;
  disabled?: boolean;
}

// Text nodes keep any model-produced markup as text, never executable HTML.
function draftParagraphs(content: string) {
  return content.trim().split(/\n\s*\n/).map((paragraph) => ({
    type: "paragraph",
    content: [{ type: "text", text: paragraph.trim() }],
  }));
}

export default function StoryWritingAssistant({ title, files, onFilesChange, onBusyChange, editorRef, disabled = false }: Props) {
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<{ id: number; controller?: AbortController }>({ id: 0 });
  const currentTitle = useRef(title);
  currentTitle.current = title;

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  useEffect(() => () => {
    requestRef.current.id += 1;
    requestRef.current.controller?.abort();
  }, []);

  const cancelRequest = () => {
    requestRef.current.id += 1;
    requestRef.current.controller?.abort();
    setBusy(false);
    onBusyChange(false);
  };

  const generate = async (photos: File[]) => {
    cancelRequest();
    setDraft("");
    setMessage("");
    const validationError = validateStoryPhotos(photos);
    if (validationError) { setError(validationError); return; }
    setError("");
    const controller = new AbortController();
    const requestId = requestRef.current.id;
    requestRef.current.controller = controller;
    const initialHtml = editorRef.current?.getHTML();
    setBusy(true);
    onBusyChange(true);
    // Leave room for the server's model timeout, but always provide a way out.
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const result = await generateBoardDraft({ files: photos, title, note }, controller.signal);
      if (requestId !== requestRef.current.id) return;
      const editor = editorRef.current;
      if (editor && editor.isEmpty && editor.getHTML() === initialHtml && currentTitle.current === title) {
        editor.commands.setContent({ type: "doc", content: draftParagraphs(result.content) });
        setMessage("본문을 채웠어요. 여행의 기억에 맞게 자유롭게 다듬어 보세요.");
      } else {
        setDraft(result.content);
        setMessage("작성 중인 글은 그대로 두었어요. 새 초안을 확인하고 적용해 주세요.");
      }
    } catch (err) {
      if (requestId !== requestRef.current.id) return;
      setError(controller.signal.aborted
        ? "작성 시간이 길어지고 있어요. 다시 시도하거나 직접 작성해 주세요."
        : err instanceof Error ? err.message : "AI 본문을 작성하지 못했어요. 다시 시도해 주세요.");
    } finally {
      window.clearTimeout(timeout);
      if (requestId === requestRef.current.id) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };

  const changeFiles = (next: File[]) => {
    if (next.length) {
      const validationError = validateStoryPhotos(next);
      if (validationError) { setError(validationError); return; }
    }
    cancelRequest();
    setError("");
    setDraft("");
    setMessage("");
    onFilesChange(next);
    if (mode === "ai" && next.length) void generate(next);
  };

  const switchMode = (next: "ai" | "manual") => {
    if (next === mode) return;
    cancelRequest();
    setError("");
    setDraft("");
    setMessage("");
    setMode(next);
  };

  const applyDraft = (append: boolean) => {
    const editor = editorRef.current;
    if (!editor || !draft) return;
    const paragraphs = draftParagraphs(draft);
    if (append) editor.commands.insertContentAt(editor.state.doc.content.size, paragraphs);
    else editor.commands.setContent({ type: "doc", content: paragraphs });
    setDraft("");
    setMessage("본문에 적용했어요. 발행 전에 내용을 확인해 주세요.");
  };

  return (
    <fieldset className="story-assistant" disabled={disabled}>
      <legend className="sr-only">여행 이야기 작성 방식</legend>
      <div className="story-assistant-heading">
        <div>
          <p className="story-assistant-eyebrow"><Sparkles size={13} aria-hidden="true" /> 나의 여행, 나다운 기록</p>
          <h2>이야기를 어떻게 시작할까요?</h2>
        </div>
        <div className="story-writing-modes" role="group" aria-label="작성 방식 선택">
          <button type="button" aria-pressed={mode === "ai"} onClick={() => switchMode("ai")}><Sparkles size={16} aria-hidden="true" /> AI로 작성</button>
          <button type="button" aria-pressed={mode === "manual"} onClick={() => switchMode("manual")}><PenLine size={16} aria-hidden="true" /> 직접 작성</button>
        </div>
      </div>

      {mode === "ai" ? (
        <div className="story-ai-intro">
          <strong>사진 몇 장이면, 여행 이야기가 완성돼요</strong>
          <p>사진을 고르면 AI가 장면에 맞춰 본문을 써드려요. 완성된 글은 마음껏 수정할 수 있어요.</p>
        </div>
      ) : <p className="story-manual-intro">나만의 말로 여행을 기록해 보세요. 언제든 AI의 도움을 받을 수 있어요.</p>}

      {(mode === "ai" || files.length > 0) && <>
        {mode === "ai" && <label className="story-ai-note">
          <span>함께 담고 싶은 기억 <small>선택</small></span>
          <input value={note} disabled={busy} maxLength={500} placeholder="예: 강릉 안목해변, 친구와 보낸 느긋한 오후"
            onChange={(event) => { cancelRequest(); setDraft(""); setMessage(""); setNote(event.target.value); }} />
        </label>}

        <div className="story-photo-label"><span>여행 사진 <b>{files.length}/{MAX_STORY_PHOTOS}</b></span><small>JPG · PNG · WebP, 장당 5MB · 전체 15MB</small></div>
        <div className={files.length ? "story-photo-grid" : "story-photo-empty"}>
          {files.map((file, index) => <div className="story-photo" key={`${file.name}-${file.lastModified}-${index}`}>
            {previews[index] && <img src={previews[index]} alt={`여행 사진 ${index + 1}: ${file.name}`} />}
            <span className="story-photo-number">{index + 1}</span>
            <button type="button" disabled={busy} aria-label={`여행 사진 ${index + 1} 삭제`} onClick={() => changeFiles(files.filter((_, i) => i !== index))}><X size={14} /></button>
          </div>)}
          {files.length < MAX_STORY_PHOTOS && <button type="button" disabled={busy} className="story-photo-add" onClick={() => inputRef.current?.click()}>
            <span className="story-photo-add-icon"><ImagePlus size={23} aria-hidden="true" /></span>
            <strong>{files.length ? "사진 더 담기" : "여행 사진 고르기"}</strong>
            {!files.length && <span>한 번에 여러 장을 선택할 수 있어요</span>}
          </button>}
        </div>
        <input ref={inputRef} disabled={busy} className="sr-only" tabIndex={-1} aria-label="AI 여행 사진 선택" type="file" multiple accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const selected = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (selected.length) changeFiles([...files, ...selected]);
          }} />
        <p className="story-photo-hint">선택한 사진은 발행할 때 이야기에 함께 담겨요.{mode === "ai" && " AI 작성을 위해 사진을 분석해요."}</p>
      </>}

      {mode === "ai" && <div className="story-ai-actions">
        <p role="status" aria-live="polite">{busy ? <><Loader2 className="animate-spin" size={16} /> 사진 속 순간을 이야기로 옮기고 있어요...</> : message ? <><Check size={16} />{message}</> : "사진을 선택하면 본문이 자동으로 작성돼요."}</p>
        {files.length > 0 && <button type="button" className="story-ai-generate" disabled={busy} onClick={() => void generate(files)}>
          <RefreshCw size={14} aria-hidden="true" /> {error ? "다시 시도" : "다시 써주기"}
        </button>}
      </div>}
      {error && <p role="alert" className="story-ai-error">{error}</p>}
      {draft && <div className="story-draft-preview">
        <strong><Sparkles size={15} aria-hidden="true" /> 새로 쓴 AI 초안</strong>
        <p>{draft}</p>
        <div className="story-draft-buttons">
          <button type="button" className="story-ai-generate" onClick={() => applyDraft(true)}>기존 글 뒤에 추가</button>
          <button type="button" onClick={() => applyDraft(false)}>이 초안으로 본문 바꾸기</button>
          <button type="button" onClick={() => setDraft("")}>초안 닫기</button>
        </div>
      </div>}
    </fieldset>
  );
}
