import { useState, type MutableRefObject } from "react";
import type { Editor } from "@tiptap/react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { generateBoardDraft, MAX_STORY_PHOTO_BYTES } from "@/services/board-ai";
import type { CourseResponse, CourseSpotSummary } from "@/services/course";
import StoryWritingAssistant from "./story-writing-assistant";

vi.mock("@/services/board-ai", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/services/board-ai")>(),
  generateBoardDraft: vi.fn(),
}));

const generateMock = vi.mocked(generateBoardDraft);
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

function photo(name = "beach.jpg", type = "image/jpeg"): File {
  return new File(["photo"], name, { type });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

type StoryCourse = Pick<CourseResponse, "courseId" | "title" | "days">;

function courseSpot(spotId: number, title: string): CourseSpotSummary {
  return { spotId, title, sequence: 1, memo: null, category: "여행지", region: "강원", sigungu: "춘천",
    address: null, thumbnail: null, latitude: null, longitude: null };
}

const chuncheonCourse: StoryCourse = {
  courseId: 42,
  title: "춘천 2박 3일",
  days: [
    { dayNumber: 1, spots: [courseSpot(10, "강촌레일파크"), courseSpot(20, "의암호")] },
    { dayNumber: 2, spots: [courseSpot(20, "의암호"), courseSpot(30, "공지천")] },
  ],
};

function setup({ html = "<p></p>", initialFiles = [], initialCourse }: {
  html?: string; initialFiles?: File[]; initialCourse?: StoryCourse;
} = {}) {
  let currentHtml = html;
  const editor = {
    isEmpty: html === "<p></p>",
    getHTML: vi.fn(() => currentHtml),
    commands: {
      setContent: vi.fn(),
      insertContentAt: vi.fn(),
    },
    state: { doc: { content: { size: 24 } } },
  };
  const editorRef = { current: editor as unknown as Editor } as MutableRefObject<Editor | null>;
  const onBusyChange = vi.fn();
  const onFilesChange = vi.fn();

  let currentTitle = "강릉 여행";
  let currentCourse = initialCourse;

  function Harness({ title = currentTitle, course = currentCourse }: { title?: string; course?: StoryCourse }) {
    const [files, setFiles] = useState(initialFiles);
    return <StoryWritingAssistant title={title} course={course} files={files} editorRef={editorRef} onBusyChange={onBusyChange}
      onFilesChange={(next) => { onFilesChange(next); setFiles(next); }} />;
  }

  const rendered = render(<Harness />);
  return {
    ...rendered,
    editor,
    onBusyChange,
    onFilesChange,
    changeTitle(title: string) {
      currentTitle = title;
      rendered.rerender(<Harness />);
    },
    changeCourse(course: StoryCourse | undefined) {
      currentCourse = course;
      rendered.rerender(<Harness />);
    },
    typeInEditor(nextHtml: string) {
      currentHtml = nextHtml;
      editor.isEmpty = nextHtml === "<p></p>";
    },
  };
}

function selectPhotos(files: File[]) {
  fireEvent.change(screen.getByLabelText("AI 여행 사진 선택"), { target: { files } });
}

beforeEach(() => {
  generateMock.mockReset();
  generateMock.mockResolvedValue({ content: "바다가 반겨준 하루.\n\n친구와 오래 걸었다." });
  let nextUrl = 0;
  URL.createObjectURL = vi.fn(() => `blob:trip-${nextUrl++}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe("StoryWritingAssistant", () => {
  test("코스의 중복 장소를 한 번씩 보여주고 방문을 자동으로 선택하지 않는다", async () => {
    const { editor } = setup({ initialCourse: chuncheonCourse });
    const places = within(screen.getByRole("group", { name: "다녀온 장소 선택" }));

    expect(places.getAllByRole("button")).toHaveLength(3);
    expect(places.getAllByRole("button", { name: "의암호" })).toHaveLength(1);
    places.getAllByRole("button").forEach((button) => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByText("아직 선택한 장소가 없어요")).toBeInTheDocument();

    selectPhotos([photo()]);

    await waitFor(() => expect(editor.commands.setContent).toHaveBeenCalledTimes(1));
    expect(generateMock.mock.calls[0][0]).toEqual(expect.objectContaining({ courseId: 42, visitedSpotIds: [] }));
  });

  test("직접 선택한 장소만 전달하고 해제한 장소는 제외하며 생성 중 선택을 막는다", async () => {
    const pending = deferred<{ content: string }>();
    generateMock.mockReturnValueOnce(pending.promise);
    const { editor } = setup({ initialCourse: chuncheonCourse });
    const places = within(screen.getByRole("group", { name: "다녀온 장소 선택" }));
    const rail = places.getByRole("button", { name: "강촌레일파크" });
    const lake = places.getByRole("button", { name: "의암호" });
    fireEvent.click(rail);
    fireEvent.click(lake);
    expect(screen.getByText("2곳 선택 · 최대 20곳")).toBeInTheDocument();
    fireEvent.click(lake);
    expect(rail).toHaveAttribute("aria-pressed", "true");
    expect(lake).toHaveAttribute("aria-pressed", "false");

    selectPhotos([photo()]);

    expect(generateMock.mock.calls[0][0]).toEqual(expect.objectContaining({ courseId: 42, visitedSpotIds: [10] }));
    places.getAllByRole("button").forEach((button) => expect(button).toBeDisabled());
    fireEvent.click(lake);
    expect(lake).toHaveAttribute("aria-pressed", "false");
    await act(async () => pending.resolve({ content: "레일바이크를 타고 왔어요." }));
    expect(editor.commands.setContent).toHaveBeenCalledTimes(1);
    expect(lake).toBeEnabled();
  });

  test("장소를 바꾸면 이전 초안을 지우고 다시 쓸 때 새 선택만 전달한다", async () => {
    setup({ html: "<p>내 여행 기록</p>", initialCourse: chuncheonCourse });
    fireEvent.click(screen.getByRole("button", { name: "강촌레일파크" }));
    selectPhotos([photo()]);
    await screen.findByText("새로 쓴 AI 초안");

    fireEvent.click(screen.getByRole("button", { name: "강촌레일파크" }));
    fireEvent.click(screen.getByRole("button", { name: "의암호" }));

    expect(screen.queryByText("새로 쓴 AI 초안")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("다녀온 장소를 바꿨어요");
    fireEvent.click(screen.getByRole("button", { name: "다시 써주기" }));
    await screen.findByText("새로 쓴 AI 초안");
    expect(generateMock.mock.calls[1][0]).toEqual(expect.objectContaining({ courseId: 42, visitedSpotIds: [20] }));
  });

  test("코스를 바꾸면 이전 장소 선택과 미리보기를 지운다", async () => {
    const { changeCourse } = setup({ html: "<p>내 여행 기록</p>", initialCourse: chuncheonCourse });
    fireEvent.click(screen.getByRole("button", { name: "강촌레일파크" }));
    selectPhotos([photo()]);
    await screen.findByText("새로 쓴 AI 초안");

    changeCourse({ courseId: 43, title: "다른 춘천 코스", days: chuncheonCourse.days });

    expect(screen.queryByText("새로 쓴 AI 초안")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "강촌레일파크" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("아직 선택한 장소가 없어요")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 써주기" }));
    await screen.findByText("새로 쓴 AI 초안");
    expect(generateMock.mock.calls[1][0]).toEqual(expect.objectContaining({ courseId: 43, visitedSpotIds: [] }));
  });

  test.each(["<p></p>", "<p>이미 쓴 여행 기록</p>"])("생성 중 코스가 바뀌면 늦게 온 결과를 본문이나 미리보기에 넣지 않는다: %s", async (html) => {
    const pending = deferred<{ content: string }>();
    generateMock.mockReturnValueOnce(pending.promise);
    const { editor, changeCourse, onBusyChange } = setup({ html, initialCourse: chuncheonCourse });
    fireEvent.click(screen.getByRole("button", { name: "강촌레일파크" }));
    selectPhotos([photo()]);

    changeCourse({ courseId: 43, title: "다른 춘천 코스", days: chuncheonCourse.days });
    await act(async () => pending.resolve({ content: "이전 코스의 오래된 초안" }));

    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(screen.queryByText("이전 코스의 오래된 초안")).not.toBeInTheDocument();
    expect(screen.queryByText("새로 쓴 AI 초안")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("코스나 다녀온 장소가 바뀌었어요");
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  test("여러 사진을 선택하면 제목과 기억을 보내고 빈 본문에 자동으로 초안을 채운다", async () => {
    const { editor, onFilesChange, onBusyChange } = setup();
    const files = [photo(), photo("cafe.png", "image/png")];
    fireEvent.change(screen.getByLabelText(/직접 겪은 일이나 기억/), { target: { value: "친구와 함께 보낸 오후" } });

    selectPhotos(files);

    await waitFor(() => expect(editor.commands.setContent).toHaveBeenCalledTimes(1));
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.calls[0][0]).toEqual({ files, title: "강릉 여행", note: "친구와 함께 보낸 오후" });
    expect(generateMock.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
    expect(onFilesChange).toHaveBeenCalledWith(files);
    expect(editor.commands.setContent).toHaveBeenCalledWith({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "바다가 반겨준 하루." }] },
        { type: "paragraph", content: [{ type: "text", text: "친구와 오래 걸었다." }] },
      ],
    });
    expect(onBusyChange).toHaveBeenCalledWith(true);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole("status")).toHaveTextContent("본문을 채웠어요");
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });

  test("직접 작성에서는 사진을 변경해도 AI를 요청하거나 기존 글을 바꾸지 않는다", () => {
    const { editor, onFilesChange } = setup({ html: "<p>내가 쓴 여행 기록</p>", initialFiles: [photo()] });

    fireEvent.click(screen.getByRole("button", { name: "직접 작성" }));
    selectPhotos([photo("cafe.png", "image/png")]);

    expect(screen.getByRole("button", { name: "직접 작성" })).toHaveAttribute("aria-pressed", "true");
    expect(onFilesChange.mock.calls[0][0]).toHaveLength(2);
    expect(generateMock).not.toHaveBeenCalled();
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(editor.commands.insertContentAt).not.toHaveBeenCalled();
    expect(editor.getHTML()).toBe("<p>내가 쓴 여행 기록</p>");
  });

  test("직접 작성으로 전환하면 진행 중 요청을 취소하고 늦게 도착한 초안을 무시한다", async () => {
    const pending = deferred<{ content: string }>();
    generateMock.mockReturnValueOnce(pending.promise);
    const { editor, onBusyChange } = setup();
    selectPhotos([photo()]);
    const signal = generateMock.mock.calls[0][1]!;
    expect(screen.getByRole("status")).toHaveTextContent("사진 속 순간");

    fireEvent.click(screen.getByRole("button", { name: "직접 작성" }));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ content: "무시해야 하는 초안" }));

    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(screen.queryByText("무시해야 하는 초안")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("생성 중에는 사진 변경을 막고 직접 작성으로 취소한 뒤에만 새 요청을 시작한다", async () => {
    const outdated = deferred<{ content: string }>();
    const latest = deferred<{ content: string }>();
    generateMock.mockReturnValueOnce(outdated.promise).mockReturnValueOnce(latest.promise);
    const { editor } = setup();
    const beach = photo();
    const cafe = photo("cafe.png", "image/png");
    selectPhotos([beach, cafe]);
    const oldSignal = generateMock.mock.calls[0][1]!;

    expect(screen.getByRole("button", { name: "여행 사진 1 삭제" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "사진 더 담기" })).toBeDisabled();
    expect(screen.getByLabelText("AI 여행 사진 선택")).toBeDisabled();
    expect(screen.getByLabelText(/직접 겪은 일이나 기억/)).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "여행 사진 1 삭제" }));
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(oldSignal.aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "직접 작성" }));
    fireEvent.click(screen.getByRole("button", { name: "여행 사진 1 삭제" }));
    expect(oldSignal.aborted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "AI로 작성" }));
    expect(generateMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "다시 써주기" }));
    expect(generateMock.mock.calls[1][0].files).toEqual([cafe]);
    await act(async () => outdated.resolve({ content: "삭제한 바다 사진의 초안" }));
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("사진 속 순간");

    await act(async () => latest.resolve({ content: "카페에서 보낸 오후" }));
    expect(editor.commands.setContent).toHaveBeenCalledTimes(1);
    expect(editor.commands.setContent.mock.calls[0][0].content[0].content[0].text).toBe("카페에서 보낸 오후");
  });

  test("화면을 닫으면 진행 중 요청을 취소하고 사진 미리보기 주소를 정리한다", async () => {
    const pending = deferred<{ content: string }>();
    generateMock.mockReturnValue(pending.promise);
    const { editor, unmount } = setup();
    selectPhotos([photo()]);
    const signal = generateMock.mock.calls[0][1]!;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve({ content: "사용하지 않을 초안" }));
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:trip-0");
  });

  test.each(["기존 글 뒤에 추가", "이 초안으로 본문 바꾸기"])("기존 본문은 자동 변경하지 않고 '%s'를 선택한 뒤 적용한다", async (action) => {
    const { editor } = setup({ html: "<p>소중한 나의 원본</p>" });
    selectPhotos([photo()]);

    await screen.findByText("새로 쓴 AI 초안");
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(editor.commands.insertContentAt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: action }));

    if (action === "기존 글 뒤에 추가") {
      expect(editor.commands.insertContentAt).toHaveBeenCalledWith(24, expect.arrayContaining([
        { type: "paragraph", content: [{ type: "text", text: "바다가 반겨준 하루." }] },
      ]));
      expect(editor.commands.setContent).not.toHaveBeenCalled();
    } else {
      expect(editor.commands.setContent).toHaveBeenCalledWith(expect.objectContaining({ type: "doc" }));
      expect(editor.commands.insertContentAt).not.toHaveBeenCalled();
    }
    expect(screen.queryByText("새로 쓴 AI 초안")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("본문에 적용했어요");
  });

  test("빈 본문에서 생성하는 중 직접 글을 쓰면 덮어쓰지 않고 초안을 보여준다", async () => {
    const pending = deferred<{ content: string }>();
    generateMock.mockReturnValueOnce(pending.promise);
    const { editor, typeInEditor } = setup();
    selectPhotos([photo()]);
    typeInEditor("<p>기다리면서 직접 쓴 문장</p>");

    await act(async () => pending.resolve({ content: "AI가 작성한 문장" }));

    expect(editor.getHTML()).toBe("<p>기다리면서 직접 쓴 문장</p>");
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(screen.getByText("AI가 작성한 문장")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("작성 중인 글은 그대로 두었어요");
  });

  test("생성 중 제목을 바꾸면 이전 제목의 초안을 본문에 자동 적용하지 않는다", async () => {
    const pending = deferred<{ content: string }>();
    generateMock.mockReturnValueOnce(pending.promise);
    const { editor, changeTitle } = setup();
    selectPhotos([photo()]);
    changeTitle("친구와 다녀온 제주 여행");

    await act(async () => pending.resolve({ content: "이전 강릉 제목으로 생성한 초안" }));

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(screen.getByText("이전 강릉 제목으로 생성한 초안")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 초안으로 본문 바꾸기" })).toBeInTheDocument();
  });

  test("생성이 실패하면 사진과 본문을 보존하고 같은 사진으로 다시 시도한다", async () => {
    generateMock.mockRejectedValueOnce(new Error("AI 서버가 잠시 쉬고 있어요."));
    const { editor } = setup();
    const file = photo();
    selectPhotos([file]);

    expect(await screen.findByRole("alert")).toHaveTextContent("AI 서버가 잠시 쉬고 있어요.");
    expect(editor.commands.setContent).not.toHaveBeenCalled();
    expect(screen.getByRole("img")).toHaveAttribute("alt", "여행 사진 1: beach.jpg");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => expect(editor.commands.setContent).toHaveBeenCalledTimes(1));
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(generateMock.mock.calls[1][0].files).toEqual([file]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test.each(["format", "size", "count"])("잘못된 사진 %s은 추가하거나 AI에 보내지 않는다", (reason) => {
    const { onFilesChange } = setup();
    let files: File[];
    let message: string;
    if (reason === "format") {
      files = [photo("animation.gif", "image/gif")];
      message = "JPG, PNG, WebP";
    } else if (reason === "size") {
      const large = photo();
      Object.defineProperty(large, "size", { value: MAX_STORY_PHOTO_BYTES + 1 });
      files = [large];
      message = "5MB";
    } else {
      files = Array.from({ length: 7 }, (_, index) => photo(`trip-${index}.jpg`));
      message = "최대 6장";
    }

    selectPhotos(files);

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(generateMock).not.toHaveBeenCalled();
    expect(onFilesChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  test("모델이 반환한 HTML은 미리보기와 본문 모두 실행하지 않고 텍스트로 적용한다", async () => {
    const unsafeText = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    generateMock.mockResolvedValueOnce({ content: unsafeText });
    const { editor, container } = setup({ html: "<p>기존 본문</p>" });
    selectPhotos([photo()]);

    expect(await screen.findByText(unsafeText)).toBeInTheDocument();
    expect(container.querySelector(".story-draft-preview img")).toBeNull();
    expect(container.querySelector(".story-draft-preview script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "이 초안으로 본문 바꾸기" }));

    expect(editor.commands.setContent).toHaveBeenCalledWith({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: unsafeText }] }],
    });
  });
});
