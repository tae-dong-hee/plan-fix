package taedonghee.plan_fix.application.board;

/**
 * [application] 공개 게시글 목록 조회 요청.
 * sort는 "latest"(최신순)|"popular"(좋아요 많은 순) 문자열이며, null이면 latest로 취급한다.
 */
public record BoardListQuery(String sort, int offset, int size) {
}
