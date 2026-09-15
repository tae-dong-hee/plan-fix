import { render, screen } from "@testing-library/react";

import CourseMetadata from "./course-metadata";

describe("CourseMetadata", () => {
  it("AI 생성 출처와 선택한 테마를 함께 보여준다", () => {
    render(<CourseMetadata generatedBy="LLM" themes={["HEALING", "CAFE"]} />);

    expect(screen.getByText("AI로 만든 코스")).toBeInTheDocument();
    expect(screen.getByText("힐링·자연")).toBeInTheDocument();
    expect(screen.getByText("카페 투어")).toBeInTheDocument();
    expect(screen.queryByText("맞춤 추천 코스")).not.toBeInTheDocument();
  });

  it("규칙 기반 추천을 AI 생성으로 표시하지 않는다", () => {
    render(<CourseMetadata generatedBy="RULE_BASED" themes={["FOOD"]} />);

    expect(screen.getByText("맞춤 추천 코스")).toBeInTheDocument();
    expect(screen.getByText("맛집 탐방")).toBeInTheDocument();
    expect(screen.queryByText("AI로 만든 코스")).not.toBeInTheDocument();
  });

  it.each([undefined, null, "MANUAL"] as const)("출처 %s인 코스에 자동 생성 표시를 만들지 않는다", (generatedBy) => {
    const { container } = render(<CourseMetadata generatedBy={generatedBy} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("모든 테마를 생략 없이 보여주고 중복 테마는 한 번만 표시한다", () => {
    render(<CourseMetadata themes={["HEALING", "FOOD", "CAFE", "ACTIVITY", "CULTURE", "CAFE"]} />);

    for (const label of ["힐링·자연", "맛집 탐방", "카페 투어", "액티비티", "문화·역사"]) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    expect(screen.queryByText("AI로 만든 코스")).not.toBeInTheDocument();
  });
});
