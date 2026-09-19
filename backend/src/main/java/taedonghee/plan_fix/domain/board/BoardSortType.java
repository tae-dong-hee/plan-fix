package taedonghee.plan_fix.domain.board;

/**
 * [domain] 공개 게시글 목록 조회의 정렬 기준.
 */
public enum BoardSortType {

    /** 최근 등록된 순 (createdAt 내림차순, 등록 시각이 같으면 boardId 내림차순) */
    LATEST,

    /** 좋아요 많은 순 (likeCount 내림차순, 동점이면 최신순) */
    POPULAR
}
