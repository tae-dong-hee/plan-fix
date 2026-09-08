import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import MyCoursePicker from "@/components/ui/my-course-picker";
import type { CourseResponse } from "@/services/course";

const courses: CourseResponse[] = [
  {
    courseId: 101,
    userId: 7,
    title: "강릉 바다 여행",
    description: "친구와 떠나는 바닷가 여행",
    thumbnail: "https://example.com/gangneung.jpg",
    visibility: "PUBLIC",
    status: "ACTIVE",
    viewCount: 0,
    likeCount: 0,
    startDate: "2026-09-12",
    endDate: "2026-09-13",
    days: [{
      dayNumber: 1,
      spots: [{
        spotId: 11,
        sequence: 0,
        memo: null,
        title: "안목해변",
        category: "자연",
        region: "강원",
        sigungu: "강릉시",
        address: "강원 강릉시 창해로",
        thumbnail: "https://example.com/anmok.jpg",
        latitude: 37.77,
        longitude: 128.95,
      }],
    }],
    createdAt: "2026-09-09T09:00:00Z",
    updatedAt: "2026-09-09T09:00:00Z",
  },
  {
    courseId: 102,
    userId: 7,
    title: "춘천 산책",
    description: null,
    thumbnail: null,
    visibility: "PRIVATE",
    status: "ACTIVE",
    viewCount: 0,
    likeCount: 0,
    startDate: null,
    endDate: null,
    days: [{
      dayNumber: 1,
      spots: [{
        spotId: 12,
        sequence: 0,
        memo: null,
        title: "소양강 스카이워크",
        category: "관광",
        region: "강원",
        sigungu: "춘천시",
        address: null,
        thumbnail: "https://example.com/soyang.jpg",
        latitude: null,
        longitude: null,
      }],
    }],
    createdAt: "2026-09-09T09:00:00Z",
    updatedAt: "2026-09-09T09:00:00Z",
  },
];

function PickerHarness({ initialValue = null, onChange = vi.fn() }: {
  initialValue?: number | null;
  onChange?: (value: number | null) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return <MyCoursePicker courses={courses} value={value} onChange={(next) => {
    setValue(next);
    onChange(next);
  }} loading={false} error={null} onRetry={vi.fn()} />;
}

function openPicker(name = "내 코스 선택하기") {
  const trigger = screen.getByRole("button", { name: new RegExp(name) });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, dialog: screen.getByRole("dialog", { name: "내 코스 선택하기" }) };
}

describe("MyCoursePicker", () => {
  it("사진과 장소를 보고 선택한 코스를 확인한 뒤에만 연결한다", () => {
    const onChange = vi.fn();
    render(<PickerHarness onChange={onChange} />);
    const { dialog } = openPicker();
    expect(within(dialog).getByRole("button", { name: "이 코스 연결하기" })).toBeDisabled();
    expect(within(dialog).getByText("2026.09.12 — 2026.09.13")).toBeInTheDocument();
    expect(within(dialog).getByText("안목해변")).toBeInTheDocument();
    expect(dialog.querySelector('img[src="https://example.com/gangneung.jpg"]')).toBeInTheDocument();
    expect(dialog.querySelector('img[src="https://example.com/soyang.jpg"]')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("radio", { name: "강릉 바다 여행" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "이 코스 연결하기" }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith(101);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("연결된 코스")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "강릉 바다 여행" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "코스 변경" })).toBeInTheDocument();
  });

  it("다른 카드를 고르다가 취소하면 원래 연결과 다음 선택 상태를 유지한다", () => {
    const onChange = vi.fn();
    render(<PickerHarness initialValue={101} onChange={onChange} />);
    let { dialog } = openPicker("코스 변경");
    expect(within(dialog).getByRole("radio", { name: "강릉 바다 여행" })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("radio", { name: "춘천 산책" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "강릉 바다 여행" })).toBeInTheDocument();
    ({ dialog } = openPicker("코스 변경"));
    expect(within(dialog).getByRole("radio", { name: "강릉 바다 여행" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "춘천 산책" })).not.toBeChecked();
  });

  it("방문 장소로 코스를 찾고 검색 결과가 없으면 검색을 초기화한다", () => {
    render(<PickerHarness />);
    const { dialog } = openPicker();
    const search = within(dialog).getByRole("searchbox", { name: "내 코스 검색" });
    fireEvent.change(search, { target: { value: "소양강" } });
    expect(within(dialog).getByRole("radio", { name: "춘천 산책" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("radio", { name: "강릉 바다 여행" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "없는 여행지" } });
    expect(within(dialog).getByText("검색한 코스가 없어요")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "검색 초기화" }));
    expect(search).toHaveValue("");
    expect(within(dialog).getAllByRole("radio")).toHaveLength(2);
  });

  it("연결 해제로 코스를 연결하지 않는 상태로 돌아간다", () => {
    const onChange = vi.fn();
    render(<PickerHarness initialValue={101} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "연결 해제" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
    expect(screen.queryByText("연결된 코스")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /내 코스 선택하기/ })).toBeInTheDocument();
  });

  it("로딩과 오류를 구분하고 다시 불러오기로 요청을 재시도한다", () => {
    const onRetry = vi.fn();
    const props = { courses: [], value: null, onChange: vi.fn(), onRetry };
    const { rerender } = render(<MyCoursePicker {...props} loading error={null} />);
    openPicker();
    expect(screen.getByRole("status")).toHaveTextContent("내 코스를 불러오고 있어요.");
    expect(screen.getByRole("button", { name: "이 코스 연결하기" })).toBeDisabled();
    rerender(<MyCoursePicker {...props} loading={false} error="코스를 불러오지 못했습니다." />);
    expect(screen.getByRole("alert")).toHaveTextContent("코스를 불러오지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "이 코스 연결하기" })).toBeDisabled();
  });

  it("저장한 코스가 없을 때 빈 상태를 표시하고 코스를 연결하지 않는다", () => {
    const onChange = vi.fn();
    render(<MyCoursePicker courses={[]} value={null} onChange={onChange} loading={false} error={null} onRetry={vi.fn()} />);
    openPicker();
    expect(screen.getByText("아직 저장한 내 코스가 없어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이 코스 연결하기" })).toBeDisabled();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape는 임시 선택을 버리고 스크롤과 열기 버튼의 초점을 복원한다", () => {
    const onChange = vi.fn();
    const previousOverflow = document.body.style.overflow;
    render(<PickerHarness onChange={onChange} />);
    const { trigger, dialog } = openPicker();
    expect(within(dialog).getByRole("searchbox")).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(dialog).getByRole("radio", { name: "춘천 산책" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe(previousOverflow);
  });

  it("이미지와 일정 정보가 없어도 코스를 선택할 수 있다", () => {
    const onChange = vi.fn();
    const noImageCourse: CourseResponse = { ...courses[1], days: [] };
    render(<MyCoursePicker courses={[noImageCourse]} value={null} onChange={onChange} loading={false} error={null} onRetry={vi.fn()} />);
    const { dialog } = openPicker();
    expect(dialog.querySelector("img")).not.toBeInTheDocument();
    expect(within(dialog).getByText("여행 날짜 미정")).toBeInTheDocument();
    expect(within(dialog).getByText("아직 담은 장소가 없어요")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "춘천 산책" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "이 코스 연결하기" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(102);
  });
});
