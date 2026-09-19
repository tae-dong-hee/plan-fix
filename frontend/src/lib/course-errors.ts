/** 인증 만료와 코스 접근 권한 변경을 구분한다. */
export class CourseAccessError extends Error {
  constructor(message = "코스가 비공개로 변경되었거나 접근 권한이 없습니다.") {
    super(message);
    this.name = "CourseAccessError";
  }
}

export class CourseConflictError extends Error {
  constructor(message = "다른 화면에서 코스가 변경되었습니다. 최신 코스를 불러온 뒤 다시 수정해 주세요.") {
    super(message);
    this.name = "CourseConflictError";
  }
}
