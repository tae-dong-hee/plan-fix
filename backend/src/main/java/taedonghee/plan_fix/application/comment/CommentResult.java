package taedonghee.plan_fix.application.comment;
import java.time.OffsetDateTime;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.infrastructure.board.CommentJpaEntity;
/** 댓글 처리 결과. API에 전달할 본문, 작성자, 부모 댓글 및 시각 정보를 담는다. */
public record CommentResult(Long commentId, Long userId, Long boardId, Long parentCommentId,
                            String content, String status, OffsetDateTime createdAt, OffsetDateTime updatedAt,
                            String authorName, String authorProfileImageUrl, String authorDefaultAvatarColor) {
    /** JPA 엔티티를 댓글 응답용 결과 객체로 변환한다. */
    static CommentResult from(CommentJpaEntity c, UserModel author) {
        String imageKey = author == null ? null : author.getProfileImageKey();
        String imageUrl = imageKey == null ? null : "/api/v1/users/" + author.getUserId()
                + "/profile-image?v=" + imageKey.substring(imageKey.lastIndexOf('/') + 1);
        return new CommentResult(c.getCommentId(), c.getUserId(), c.getBoardId(), c.getParentCommentId(),
                c.getContent(), c.getStatus(), c.getCreatedAt(), c.getUpdatedAt(),
                author == null ? "사용자" : author.getUsername(), imageUrl,
                author == null ? "violet" : author.getDefaultAvatarColor());
    }
}
