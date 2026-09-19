package taedonghee.plan_fix.application.comment;

import org.junit.jupiter.api.Test;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.domain.user.UserStatus;
import taedonghee.plan_fix.infrastructure.board.BoardJpaRepository;
import taedonghee.plan_fix.infrastructure.board.CommentJpaEntity;
import taedonghee.plan_fix.infrastructure.board.CommentJpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class CommentApplicationServiceTest {
    private static final String IMAGE_KEY = "users/7/profile/00000000-0000-0000-0000-000000000007.png";
    private static final String IMAGE_URL = "/api/v1/users/7/profile-image?v=00000000-0000-0000-0000-000000000007.png";
    private final CommentJpaRepository comments = mock(CommentJpaRepository.class);
    private final BoardJpaRepository boards = mock(BoardJpaRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final CommentApplicationService service = new CommentApplicationService(comments, boards, users);

    @Test
    void listIncludesAuthorPhotosForCommentsAndReplies() {
        when(comments.findByBoardIdAndStatusOrderByCreatedAtAscCommentIdAsc(5L, "ACTIVE"))
                .thenReturn(List.of(comment(1L, 7L, null), comment(2L, 8L, 1L)));
        when(users.findByUserId(7L)).thenReturn(Optional.of(user(7L, IMAGE_KEY, "rose")));
        when(users.findByUserId(8L)).thenReturn(Optional.of(user(8L, null, "blue")));

        List<CommentResult> results = service.list(5L);

        assertThat(results.getFirst().authorName()).isEqualTo("traveler7");
        assertThat(results.getFirst().authorProfileImageUrl()).isEqualTo(IMAGE_URL);
        assertThat(results.getFirst().authorDefaultAvatarColor()).isEqualTo("rose");
        assertThat(results.get(1).parentCommentId()).isEqualTo(1L);
        assertThat(results.get(1).authorProfileImageUrl()).isNull();
        assertThat(results.get(1).authorDefaultAvatarColor()).isEqualTo("blue");
    }

    @Test
    void createReplyReturnsTheAuthorsCurrentAvatar() {
        when(comments.findById(1L)).thenReturn(Optional.of(comment(1L, 8L, null)));
        when(comments.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(users.findByUserId(7L)).thenReturn(Optional.of(user(7L, IMAGE_KEY, "rose")));

        CommentResult result = service.create(7L, 5L, 1L, " 새 답글 ");

        assertThat(result.content()).isEqualTo("새 답글");
        assertThat(result.parentCommentId()).isEqualTo(1L);
        assertThat(result.authorProfileImageUrl()).isEqualTo(IMAGE_URL);
        assertThat(result.authorDefaultAvatarColor()).isEqualTo("rose");
        verify(boards).incrementCommentCount(5L);
    }

    @Test
    void updateUsesLatestPhotoAndExistingLegacyColorFallback() {
        when(comments.findById(1L)).thenReturn(Optional.of(comment(1L, 7L, null)));
        when(users.findByUserId(7L)).thenReturn(Optional.of(user(7L, null, null)));

        CommentResult result = service.update(7L, 1L, "수정한 댓글");

        assertThat(result.authorProfileImageUrl()).isNull();
        assertThat(result.authorDefaultAvatarColor()).isEqualTo("green");
        assertThat(result.content()).isEqualTo("수정한 댓글");
    }

    @Test
    void missingAuthorKeepsCommentVisibleWithDefaultAvatar() {
        when(comments.findByBoardIdAndStatusOrderByCreatedAtAscCommentIdAsc(5L, "ACTIVE"))
                .thenReturn(List.of(comment(1L, 7L, null)));
        when(users.findByUserId(7L)).thenReturn(Optional.empty());

        CommentResult result = service.list(5L).getFirst();

        assertThat(result.authorName()).isEqualTo("사용자");
        assertThat(result.authorProfileImageUrl()).isNull();
        assertThat(result.authorDefaultAvatarColor()).isEqualTo("violet");
    }

    private CommentJpaEntity comment(Long commentId, Long userId, Long parentId) {
        var now = OffsetDateTime.now();
        return CommentJpaEntity.builder().commentId(commentId).userId(userId).boardId(5L)
                .parentCommentId(parentId).content("댓글").status("ACTIVE").createdAt(now).updatedAt(now).build();
    }

    private UserModel user(Long id, String imageKey, String color) {
        var now = OffsetDateTime.now();
        return UserModel.reconstruct(id, "traveler" + id, null, null, null, imageKey, color,
                UserRole.USER, UserStatus.ACTIVE, now, now);
    }
}
