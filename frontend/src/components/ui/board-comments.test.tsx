import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import BoardComments from "@/components/ui/board-comments";

const startTime = new Date("2026-09-09T03:00:00.000Z");

function registerComment(content: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "댓글 남기기" }), {
    target: { value: content },
  });
  fireEvent.click(screen.getByRole("button", { name: "댓글 등록" }));
}

function commentItems() {
  return within(screen.getByRole("list", { name: "댓글 목록" })).queryAllByRole("listitem");
}

describe("BoardComments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(startTime);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("starts with an empty comment list without preview labels or sample comments", () => {
    render(<BoardComments />);

    expect(screen.getByRole("heading", { name: "댓글" })).toBeInTheDocument();
    expect(commentItems()).toHaveLength(0);
    expect(screen.queryByText(/UI 미리보기|예시 3개|예시 댓글을 보여주는 화면/)).not.toBeInTheDocument();
    expect(screen.queryByText("여행자 봄")).not.toBeInTheDocument();
    expect(screen.queryByText("느린 산책")).not.toBeInTheDocument();
    expect(screen.queryByText("이야기 작성자")).not.toBeInTheDocument();
  });

  test("rejects blank input and appends a trimmed comment, clearing and focusing the editor", () => {
    render(<BoardComments />);

    const editor = screen.getByRole("textbox", { name: "댓글 남기기" });
    const submit = screen.getByRole("button", { name: "댓글 등록" });
    expect(submit).toBeDisabled();

    fireEvent.change(editor, { target: { value: "   \n  " } });
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(commentItems()).toHaveLength(0);

    fireEvent.change(editor, { target: { value: "  다음 여행에 참고할게요!  " } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    const comments = commentItems();
    expect(comments).toHaveLength(1);
    expect(within(comments[0]).getByText("다음 여행에 참고할게요!").textContent).toBe("다음 여행에 참고할게요!");
    expect(within(comments[0]).getByText("나")).toBeInTheDocument();
    expect(within(comments[0]).getByText("방금 전")).toBeInTheDocument();
    expect(editor).toHaveValue("");
    expect(editor).toHaveFocus();
    expect(submit).toBeDisabled();
  });

  test("keeps each comment's posting time and updates elapsed minutes automatically", () => {
    render(<BoardComments />);
    registerComment("첫 번째 댓글");

    act(() => vi.advanceTimersByTime(59_000));
    expect(within(commentItems()[0]).getByText("방금 전")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_000));
    expect(within(commentItems()[0]).getByText("1분 전")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(4 * 60_000));
    expect(within(commentItems()[0]).getByText("5분 전")).toBeInTheDocument();

    registerComment("두 번째 댓글");
    expect(commentItems()).toHaveLength(2);
    expect(within(commentItems()[1]).getByText("두 번째 댓글")).toBeInTheDocument();
    expect(within(commentItems()[1]).getByText("방금 전")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(within(commentItems()[0]).getByText("10분 전")).toBeInTheDocument();
    expect(within(commentItems()[1]).getByText("5분 전")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(within(commentItems()[0]).getByText("15분 전")).toBeInTheDocument();
    expect(within(commentItems()[1]).getByText("10분 전")).toBeInTheDocument();
  });

  test.each([
    [60 * 60_000, "1시간 전"],
    [24 * 60 * 60_000, "1일 전"],
  ])("updates older comments after %i milliseconds to %s", (elapsed, expected) => {
    render(<BoardComments />);
    registerComment("시간이 지나도 남아 있는 댓글");

    act(() => {
      vi.setSystemTime(startTime.getTime() + elapsed);
      vi.advanceTimersByTime(1_000);
    });

    expect(within(commentItems()[0]).getByText(expected)).toBeInTheDocument();
  });

  test("displays entered markup as text and does not send or persist submitted comments", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const save = vi.spyOn(Storage.prototype, "setItem");
    const { container } = render(<BoardComments />);
    const content = '<img src="x" onerror="alert(1)"> 여행 이야기';

    registerComment(content);

    expect(within(commentItems()[0]).getByText(content)).toBeInTheDocument();
    expect(container.querySelector("img, script")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  test("cleans up clock updates and starts empty when the component is opened again", () => {
    const timersBefore = vi.getTimerCount();
    const { unmount } = render(<BoardComments />);
    registerComment("이번 화면에서만 보이는 댓글");
    expect(commentItems()).toHaveLength(1);
    expect(vi.getTimerCount()).toBeGreaterThan(timersBefore);

    unmount();
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(timersBefore);

    render(<BoardComments />);
    expect(commentItems()).toHaveLength(0);
    expect(screen.queryByText("이번 화면에서만 보이는 댓글")).not.toBeInTheDocument();
  });
});
