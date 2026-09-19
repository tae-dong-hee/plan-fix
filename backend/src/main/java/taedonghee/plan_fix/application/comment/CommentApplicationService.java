package taedonghee.plan_fix.application.comment;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.infrastructure.board.*;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.support.error.*;
import java.time.OffsetDateTime;
import java.util.List;

/** 댓글·대댓글 조회, 등록, 수정, 삭제를 처리하는 Application Service. */
@Service @RequiredArgsConstructor @Transactional(readOnly=true)
public class CommentApplicationService {
    private static final int MAX_LENGTH=1000;
    private final CommentJpaRepository repository;
    private final BoardJpaRepository boardRepository;
    private final UserRepository userRepository;
    /** 게시글의 활성 댓글과 대댓글을 작성 시각·댓글 ID 순으로 조회한다. */
    public List<CommentResult> list(Long boardId) { return repository.findByBoardIdAndStatusOrderByCreatedAtAscCommentIdAsc(boardId,"ACTIVE").stream().map(this::toResult).toList(); }
    /** 댓글 등록. 대댓글은 같은 게시글에 속한 활성 부모 댓글이 있어야 한다. */
    @Transactional public CommentResult create(Long userId, Long boardId, Long parentId, String content) {
        validate(content); if(parentId!=null) { CommentJpaEntity p=repository.findById(parentId).filter(x->x.getBoardId().equals(boardId)&&"ACTIVE".equals(x.getStatus())).orElseThrow(()->new CoreException(ErrorType.NOT_FOUND,"parent comment not found.")); if(p.getParentCommentId()!=null) throw new CoreException(ErrorType.BAD_REQUEST,"대댓글에는 다시 대댓글을 작성할 수 없습니다."); }
        OffsetDateTime now=OffsetDateTime.now(); CommentResult result = toResult(repository.save(CommentJpaEntity.builder().userId(userId).boardId(boardId).parentCommentId(parentId).content(content.strip()).status("ACTIVE").createdAt(now).updatedAt(now).build()));
        boardRepository.incrementCommentCount(boardId);
        return result;
    }
    /** 작성자만 내용을 수정할 수 있으며, 앞뒤 공백을 제거하고 수정 시각을 갱신한다. */
    @Transactional public CommentResult update(Long userId, Long id, String content) { validate(content); CommentJpaEntity c=get(id); ensureOwner(userId,c); c.update(content.strip()); return toResult(c); }
    /** 작성자 또는 관리자가 삭제할 수 있다. 행은 보존하고 상태만 DELETED로 변경한다. */
    @Transactional public void delete(Long userId, boolean admin, Long id) { CommentJpaEntity c=get(id); if(!admin&&!c.getUserId().equals(userId)) throw new CoreException(ErrorType.FORBIDDEN,"comment access denied."); if(!"ACTIVE".equals(c.getStatus())) return; c.delete(); boardRepository.decrementCommentCount(c.getBoardId()); }
    /** 댓글 ID 조회. 존재하지 않으면 NOT_FOUND 예외를 반환한다. */
    private CommentJpaEntity get(Long id){return repository.findById(id).orElseThrow(()->new CoreException(ErrorType.NOT_FOUND,"comment not found."));}
    /** 수정 요청자와 댓글 작성자의 일치 여부를 검사한다. */
    private void ensureOwner(Long userId, CommentJpaEntity c){if(!c.getUserId().equals(userId)) throw new CoreException(ErrorType.FORBIDDEN,"comment access denied.");}
    private CommentResult toResult(CommentJpaEntity comment) {
        // 서비스에서 username을 닉네임으로 사용하므로 댓글에도 동일한 값을 노출한다.
        return CommentResult.from(comment, userRepository.findByUserId(comment.getUserId()).orElse(null));
    }
    /** 공백만 있는 입력을 거절하고, 앞뒤 공백을 제외한 본문 길이를 1~1000자로 제한한다. */
    private void validate(String s){if(s==null||s.isBlank()||s.strip().length()>MAX_LENGTH) throw new CoreException(ErrorType.BAD_REQUEST,"댓글은 1~1000자로 입력해주세요.");}
}
