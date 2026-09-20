package taedonghee.plan_fix.application.course;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import taedonghee.plan_fix.domain.course.CourseDayModel;
import taedonghee.plan_fix.domain.course.CourseSpotModel;
import taedonghee.plan_fix.domain.course.CourseVisibility;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.domain.user.UserRole;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberRole;
import taedonghee.plan_fix.infrastructure.spot.SpotJpaEntity;
import taedonghee.plan_fix.infrastructure.spot.SpotJpaRepository;
import taedonghee.plan_fix.infrastructure.security.AuthenticatedUser;
import taedonghee.plan_fix.interfaces.api.course.CourseDayAccommodationController;
import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

/**
 * Real transaction races against the disposable PostgreSQL configured for every Spring test.
 * PostgreSQL's blocking graph, rather than elapsed time, proves the requests overlap at a lock.
 */
@SpringBootTest(properties = "security.jwt.secret=private-course-regression-test-key-not-a-production-secret")
@ActiveProfiles("test")
class CoursePrivacyConcurrencyTest {
    @Autowired CourseApplicationService courseService;
    @Autowired CourseInviteApplicationService inviteService;
    @Autowired CourseJpaRepository courses;
    @Autowired CourseInviteJpaRepository invites;
    @Autowired CourseMemberJpaRepository members;
    @Autowired UserRepository users;
    @Autowired SpotJpaRepository spots;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired CourseDayAccommodationController accommodations;

    private ExecutorService workers;
    private Long ownerId;
    private Long inviteeId;
    private Long spotId;
    private Long courseId;
    private String inviteToken;
    private List<CourseDayModel> days;

    @BeforeEach
    void createCommittedFixtures() {
        workers = Executors.newFixedThreadPool(2);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            ownerId = users.save(UserModel.create(username(), null, null)).getUserId();
            inviteeId = users.save(UserModel.create(username(), null, null)).getUserId();
            OffsetDateTime now = OffsetDateTime.now();
            spotId = spots.save(SpotJpaEntity.builder().title("Concurrent privacy spot")
                    .sourceType(SpotSourceType.NATIVE).category("test").status(SpotStatus.ACTIVE)
                    .createdAt(now).updatedAt(now).build()).getSpotId();
            days = List.of(new CourseDayModel(1, List.of(new CourseSpotModel(spotId, "Private memo"))));
            courseId = courseService.create(ownerId, new CourseCommand.Create(
                    "Concurrent privacy course", null, "https://example.test/course.jpg", CourseVisibility.PUBLIC,
                    null, null, days)).courseId();
            inviteToken = inviteService.createInvite(ownerId, courseId, CourseMemberRole.EDITOR,
                    "https://example.test").token();
        });
    }

    @AfterEach
    void removeCommittedFixtures() throws InterruptedException {
        workers.shutdownNow();
        assertThat(workers.awaitTermination(20, TimeUnit.SECONDS)).as("transaction workers terminate").isTrue();
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            if (courseId != null) {
                jdbc.update("DELETE FROM course_members WHERE course_id = ?", courseId);
                jdbc.update("DELETE FROM course_member_revocations WHERE course_id = ?", courseId);
                jdbc.update("DELETE FROM course_invites WHERE course_id = ?", courseId);
                jdbc.update("DELETE FROM course_likes WHERE course_id = ?", courseId);
                jdbc.update("DELETE FROM course_spots WHERE course_id = ?", courseId);
                jdbc.update("DELETE FROM course_day_accommodations WHERE course_id = ?", courseId);
                jdbc.update("DELETE FROM courses WHERE course_id = ?", courseId);
            }
            if (spotId != null) jdbc.update("DELETE FROM spots WHERE spot_id = ?", spotId);
            if (ownerId != null) jdbc.update("DELETE FROM users WHERE user_id = ?", ownerId);
            if (inviteeId != null) jdbc.update("DELETE FROM users WHERE user_id = ?", inviteeId);
        });
    }

    @Test
    void acceptingInviteWaitsForPrivateTransitionAndCannotCreateMembershipAfterItCommits() throws Exception {
        CountDownLatch privacyChanged = new CountDownLatch(1);
        CountDownLatch commitPrivacy = new CountDownLatch(1);
        CompletableFuture<Integer> privacyPid = new CompletableFuture<>();
        CompletableFuture<Integer> acceptPid = new CompletableFuture<>();

        Future<CourseResult> privacy = transactionWorker(privacyPid, () -> {
            CourseResult result = makePrivate();
            privacyChanged.countDown();
            awaitRelease(commitPrivacy);
            return result;
        });
        try {
            assertThat(privacyChanged.await(10, TimeUnit.SECONDS)).as("private transition holds its transaction").isTrue();
            Future<CourseInviteApplicationService.CourseInviteAcceptResult> acceptance = transactionWorker(
                    acceptPid, () -> inviteService.accept(inviteeId, inviteToken));

            assertBlockedBy(acceptPid.get(10, TimeUnit.SECONDS), privacyPid.get(10, TimeUnit.SECONDS), acceptance);
            commitPrivacy.countDown();

            assertThat(privacy.get(10, TimeUnit.SECONDS).visibility()).isEqualTo(CourseVisibility.PRIVATE);
            assertThatThrownBy(() -> acceptance.get(10, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(CoreException.class)
                    .satisfies(error -> {
                        CoreException cause = (CoreException) error.getCause();
                        assertThat(cause.getErrorType()).isEqualTo(ErrorType.NOT_FOUND);
                        assertThat(cause.getMessage()).isEqualTo("초대 링크를 찾을 수 없습니다.");
                    });
            assertPrivateWithoutSharing();
        } finally {
            commitPrivacy.countDown();
        }
    }

    @Test
    void privateTransitionWaitsForInviteAcceptanceThenRemovesItsCommittedMembershipAndLink() throws Exception {
        CountDownLatch memberJoined = new CountDownLatch(1);
        CountDownLatch commitAcceptance = new CountDownLatch(1);
        CompletableFuture<Integer> acceptPid = new CompletableFuture<>();
        CompletableFuture<Integer> privacyPid = new CompletableFuture<>();

        Future<CourseInviteApplicationService.CourseInviteAcceptResult> acceptance = transactionWorker(acceptPid, () -> {
            CourseInviteApplicationService.CourseInviteAcceptResult result = inviteService.accept(inviteeId, inviteToken);
            assertThat(result.joined()).isTrue();
            memberJoined.countDown();
            awaitRelease(commitAcceptance);
            return result;
        });
        try {
            assertThat(memberJoined.await(10, TimeUnit.SECONDS)).as("acceptance holds its transaction").isTrue();
            Future<CourseResult> privacy = transactionWorker(privacyPid, this::makePrivate);

            assertBlockedBy(privacyPid.get(10, TimeUnit.SECONDS), acceptPid.get(10, TimeUnit.SECONDS), privacy);
            commitAcceptance.countDown();

            assertThat(acceptance.get(10, TimeUnit.SECONDS).joined()).isTrue();
            assertThat(privacy.get(10, TimeUnit.SECONDS).visibility()).isEqualTo(CourseVisibility.PRIVATE);
            assertPrivateWithoutSharing();
        } finally {
            commitAcceptance.countDown();
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void accommodationEditWaitsForPermissionChangeAndIsRejectedAfterCommit(boolean makePrivate) throws Exception {
        inviteService.accept(inviteeId, inviteToken);
        CountDownLatch permissionChanged = new CountDownLatch(1);
        CountDownLatch commitPermission = new CountDownLatch(1);
        CompletableFuture<Integer> permissionPid = new CompletableFuture<>();
        CompletableFuture<Integer> editPid = new CompletableFuture<>();

        Future<Boolean> permission = transactionWorker(permissionPid, () -> {
            if (makePrivate) makePrivate();
            else inviteService.updateMemberRole(ownerId, courseId, inviteeId, CourseMemberRole.VIEWER);
            permissionChanged.countDown();
            awaitRelease(commitPermission);
            return true;
        });
        try {
            assertThat(permissionChanged.await(10, TimeUnit.SECONDS)).isTrue();
            Future<?> edit = transactionWorker(editPid, () -> accommodations.put(
                    new AuthenticatedUser(inviteeId, "invitee", UserRole.USER), courseId,
                    List.of(new CourseDayAccommodationController.Request(1, "Blocked hotel", null, null, null, null))));

            assertBlockedBy(editPid.get(10, TimeUnit.SECONDS), permissionPid.get(10, TimeUnit.SECONDS), edit);
            commitPermission.countDown();
            assertThat(permission.get(10, TimeUnit.SECONDS)).isTrue();
            assertThatThrownBy(() -> edit.get(10, TimeUnit.SECONDS))
                    .isInstanceOf(ExecutionException.class).hasCauseInstanceOf(CoreException.class)
                    .satisfies(error -> assertThat(((CoreException) error.getCause()).getErrorType())
                            .isEqualTo(ErrorType.FORBIDDEN));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM course_day_accommodations WHERE course_id = ?",
                    Long.class, courseId)).isZero();
        } finally {
            commitPermission.countDown();
        }
    }

    @Test
    void duplicateConcurrentAcceptanceCreatesExactlyOneMembership() throws Exception {
        Object replay = runAfterBlocked(() -> inviteService.accept(inviteeId, inviteToken),
                () -> inviteService.accept(inviteeId, inviteToken));
        assertThat(replay).isInstanceOfSatisfying(CourseInviteApplicationService.CourseInviteAcceptResult.class,
                result -> {
                    assertThat(result.joined()).isFalse();
                    assertThat(result.alreadyMember()).isTrue();
                });
        assertOneMemberWithRole(CourseMemberRole.EDITOR);
        assertAccommodationEditing(true);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void differentConcurrentInvitesConvergeToNewestIssuedPermissionRegardlessOfLockOrder(boolean newestFirst) throws Exception {
        String newerViewerToken = inviteService.createInvite(ownerId, courseId, CourseMemberRole.VIEWER,
                "https://example.test").token();
        runAfterBlocked(() -> inviteService.accept(inviteeId, newestFirst ? newerViewerToken : inviteToken),
                () -> inviteService.accept(inviteeId, newestFirst ? inviteToken : newerViewerToken));

        assertOneMemberWithRole(CourseMemberRole.VIEWER);
        assertAccommodationEditing(false);
    }

    @Test
    void acceptingIssuedEditorLinkWaitsForOwnerDowngradeAndCannotUndoIt() throws Exception {
        inviteService.accept(inviteeId, inviteToken);
        String pendingEditorToken = inviteService.createInvite(ownerId, courseId, CourseMemberRole.EDITOR,
                "https://example.test").token();
        runAfterBlocked(() -> {
            inviteService.updateMemberRole(ownerId, courseId, inviteeId, CourseMemberRole.VIEWER);
            return true;
        }, () -> inviteService.accept(inviteeId, pendingEditorToken));

        assertOneMemberWithRole(CourseMemberRole.VIEWER);
        assertAccommodationEditing(false);
    }

    @Test
    void ownerDowngradeWaitsForAcceptanceAndItsFinalPermissionWins() throws Exception {
        runAfterBlocked(() -> inviteService.accept(inviteeId, inviteToken), () -> {
            inviteService.updateMemberRole(ownerId, courseId, inviteeId, CourseMemberRole.VIEWER);
            return true;
        });

        assertOneMemberWithRole(CourseMemberRole.VIEWER);
        assertAccommodationEditing(false);
    }

    @Test
    void acceptanceWaitsForRemovalAndCannotRestoreMemberUsingAnAlreadyIssuedLink() throws Exception {
        inviteService.accept(inviteeId, inviteToken);
        String pendingEditorToken = inviteService.createInvite(ownerId, courseId, CourseMemberRole.EDITOR,
                "https://example.test").token();
        assertThatThrownBy(() -> runAfterBlocked(() -> {
            inviteService.removeMember(ownerId, courseId, inviteeId);
            return true;
        }, () -> inviteService.accept(inviteeId, pendingEditorToken)))
                .isInstanceOf(ExecutionException.class).hasCauseInstanceOf(CoreException.class)
                .satisfies(error -> assertThat(((CoreException) error.getCause()).getErrorType())
                        .isEqualTo(ErrorType.FORBIDDEN));

        assertThat(members.findByCourseIdOrderByCreatedAtAsc(courseId)).isEmpty();
        assertAccommodationEditing(false);
    }

    @Test
    void removalWaitsForAcceptanceThenDeletesItsMembershipAndBlocksTheSameLink() throws Exception {
        runAfterBlocked(() -> inviteService.accept(inviteeId, inviteToken), () -> {
            inviteService.removeMember(ownerId, courseId, inviteeId);
            return true;
        });

        assertThat(members.findByCourseIdOrderByCreatedAtAsc(courseId)).isEmpty();
        assertThatThrownBy(() -> inviteService.accept(inviteeId, inviteToken))
                .isInstanceOfSatisfying(CoreException.class,
                        error -> assertThat(error.getErrorType()).isEqualTo(ErrorType.FORBIDDEN));
        assertAccommodationEditing(false);
    }

    private Object runAfterBlocked(Supplier<?> holder, Supplier<?> waiter) throws Exception {
        CountDownLatch changed = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        CompletableFuture<Integer> holderPid = new CompletableFuture<>();
        CompletableFuture<Integer> waiterPid = new CompletableFuture<>();
        Future<?> first = transactionWorker(holderPid, () -> {
            Object result = holder.get();
            changed.countDown();
            awaitRelease(commit);
            return result;
        });
        try {
            assertThat(changed.await(10, TimeUnit.SECONDS)).as("first operation holds its transaction").isTrue();
            Future<?> second = transactionWorker(waiterPid, waiter);
            assertBlockedBy(waiterPid.get(10, TimeUnit.SECONDS), holderPid.get(10, TimeUnit.SECONDS), second);
            commit.countDown();
            first.get(10, TimeUnit.SECONDS);
            return second.get(10, TimeUnit.SECONDS);
        } finally {
            commit.countDown();
        }
    }

    private void assertOneMemberWithRole(CourseMemberRole role) {
        assertThat(members.findByCourseIdOrderByCreatedAtAsc(courseId)).singleElement().satisfies(member -> {
            assertThat(member.getUserId()).isEqualTo(inviteeId);
            assertThat(member.getRole()).isEqualTo(role);
        });
        assertThat(inviteService.canEdit(inviteeId, courseId)).isEqualTo(role == CourseMemberRole.EDITOR);
    }

    private void assertAccommodationEditing(boolean permitted) {
        var user = new AuthenticatedUser(inviteeId, "invitee", UserRole.USER);
        var request = List.of(new CourseDayAccommodationController.Request(1, "Race checked hotel", null, null, null, null));
        if (permitted) {
            accommodations.put(user, courseId, request);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM course_day_accommodations WHERE course_id = ?",
                    Long.class, courseId)).isEqualTo(1L);
        } else {
            assertThatThrownBy(() -> accommodations.put(user, courseId, request))
                    .isInstanceOfSatisfying(CoreException.class,
                            error -> assertThat(error.getErrorType()).isEqualTo(ErrorType.FORBIDDEN));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM course_day_accommodations WHERE course_id = ?",
                    Long.class, courseId)).isZero();
        }
    }

    private <T> Future<T> transactionWorker(CompletableFuture<Integer> backendPid, Supplier<T> operation) {
        return workers.submit(() -> new TransactionTemplate(transactions).execute(status -> {
            // Bound database failures as well as the coordinating futures and latches.
            jdbc.execute("SET LOCAL lock_timeout = '15s'");
            jdbc.execute("SET LOCAL statement_timeout = '20s'");
            backendPid.complete(jdbc.queryForObject("SELECT pg_backend_pid()", Integer.class));
            return operation.get();
        }));
    }

    private void assertBlockedBy(int waiterPid, int holderPid, Future<?> waitingRequest) {
        await().atMost(Duration.ofSeconds(10)).pollDelay(Duration.ZERO).pollInterval(Duration.ofMillis(20))
                .until(() -> {
                    if (waitingRequest.isDone()) {
                        throw new AssertionError("Concurrent request completed without waiting for the course transaction");
                    }
                    return Boolean.TRUE.equals(jdbc.queryForObject(
                            "SELECT ? = ANY(pg_blocking_pids(?))", Boolean.class, holderPid, waiterPid));
                });
    }

    private CourseResult makePrivate() {
        return courseService.update(ownerId, courseId, new CourseCommand.Update(
                "Concurrent privacy course", null, "https://example.test/course.jpg", CourseVisibility.PRIVATE,
                null, null, days));
    }

    private void assertPrivateWithoutSharing() {
        assertThat(courses.findById(courseId).orElseThrow().getVisibility()).isEqualTo(CourseVisibility.PRIVATE);
        assertThat(members.findByCourseIdOrderByCreatedAtAsc(courseId)).isEmpty();
        assertThat(invites.findByCourseIdOrderByCreatedAtDesc(courseId)).isEmpty();
    }

    private static void awaitRelease(CountDownLatch release) {
        try {
            if (!release.await(20, TimeUnit.SECONDS)) {
                throw new AssertionError("Timed out waiting to release the transaction");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("Transaction worker interrupted", interrupted);
        }
    }

    private static String username() {
        return "race" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }
}
