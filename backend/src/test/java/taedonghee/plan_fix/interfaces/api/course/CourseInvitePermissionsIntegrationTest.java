package taedonghee.plan_fix.interfaces.api.course;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.spot.SpotJpaEntity;
import taedonghee.plan_fix.infrastructure.spot.SpotJpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Exercises shared course permissions using real invite acceptance, cookie authentication and PostgreSQL. */
@SpringBootTest(properties = {"security.jwt.secret=private-course-regression-test-key-not-a-production-secret",
        "app.kakao-share.admin-key=share-webhook-test-key"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CourseInvitePermissionsIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired JwtTokenProvider tokens;
    @Autowired SpotJpaRepository spots;
    @Autowired JdbcTemplate jdbc;
    @Autowired jakarta.persistence.EntityManager entityManager;

    private Cookie owner;
    private Cookie member;
    private Cookie visitor;
    private Long memberId;
    private Long courseId;
    private Long spotId;

    @Test
    void legacyDuplicateLinksHaveOneManagedRoleWhileOriginalLinksKeepTheirAuthority() throws Exception {
        String firstEditor = invite("EDITOR");
        String secondEditor = legacyDuplicate(firstEditor);
        String latestEditor = legacyDuplicate(secondEditor);
        entityManager.flush();
        // Issuance ID, not a skewed timestamp, determines the representative.
        jdbc.update("UPDATE course_invites SET created_at = created_at - interval '1 day' WHERE token = ?", latestEditor);
        entityManager.clear();
        JsonNode originalRows = read(as(owner, get(path() + "/invites")).andExpect(status().isOk()));
        JsonNode latestRow = java.util.stream.StreamSupport.stream(originalRows.spliterator(), false)
                .filter(row -> row.path("token").asText().equals(latestEditor)).findFirst().orElseThrow();

        as(owner, get(path() + "/invite-groups")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].role").value("EDITOR"))
                .andExpect(jsonPath("$[0].createdAt").value(latestRow.path("createdAt").asText()))
                .andExpect(jsonPath("$[0].expiresAt").value(latestRow.path("expiresAt").asText()))
                .andExpect(jsonPath("$[0].token").doesNotExist());
        assertThat(read(as(owner, get(path() + "/invites")))).isEqualTo(originalRows);
        for (String token : List.of(firstEditor, secondEditor, latestEditor)) {
            mvc.perform(get(invitePath(token))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.memberRole").value("EDITOR"));
        }
        accept(firstEditor).andExpect(status().isOk());
        String viewer = invite("VIEWER");
        accept(viewer).andExpect(status().isOk());
        as(owner, get(path() + "/invite-groups")).andExpect(jsonPath("$.length()").value(2));
        for (String token : List.of(firstEditor, secondEditor, latestEditor)) accept(token).andExpect(status().isOk());
        assertSingleMembershipAndEditing("VIEWER");
    }

    @Test
    void groupCancellationRemovesAllSameRoleLinksAndReceiptsWithoutChangingOtherAccess() throws Exception {
        String firstEditor = invite("EDITOR");
        String expiredEditor = legacyDuplicate(firstEditor);
        String latestEditor = legacyDuplicate(expiredEditor);
        String viewer = invite("VIEWER");
        accept(firstEditor).andExpect(status().isOk());
        String requestId = UUID.randomUUID().toString();
        String payload = mapper.writeValueAsString(Map.of("invite_token", firstEditor, "share_request_id", requestId));
        mvc.perform(post("/api/v1/webhooks/kakao/share").header("Authorization", "KakaoAK share-webhook-test-key")
                .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isNoContent());
        entityManager.flush();
        jdbc.update("UPDATE course_invites SET expires_at = now() - interval '1 minute' WHERE token = ?", expiredEditor);
        entityManager.clear();
        Long otherCourse = read(as(owner, post("/api/v1/courses").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("title", "Other trip", "visibility", "PUBLIC",
                        "days", List.of(Map.of("dayNumber", 1, "spots", List.of(Map.of("spotId", spotId, "memo", "Other"))))))))
                .andExpect(status().isCreated()))
                .path("courseId").asLong();
        String otherToken = read(as(owner, post("/api/v1/courses/" + otherCourse + "/invites")
                .contentType(MediaType.APPLICATION_JSON).content("{\"memberRole\":\"EDITOR\"}"))
                .andExpect(status().isOk())).path("token").asText();

        as(owner, delete(path() + "/invite-groups/EDITOR")).andExpect(status().isNoContent());
        entityManager.flush();
        entityManager.clear();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM course_invites WHERE course_id = ? AND member_role = 'EDITOR'", Long.class, courseId)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM course_invite_kakao_shares WHERE share_request_id = ?::uuid", Long.class, requestId)).isZero();
        as(owner, get(path() + "/invite-groups")).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].role").value("VIEWER"));
        for (String token : List.of(firstEditor, expiredEditor, latestEditor)) {
            mvc.perform(get(invitePath(token))).andExpect(status().isNotFound());
            accept(token).andExpect(status().isNotFound());
        }
        mvc.perform(get(invitePath(viewer))).andExpect(status().isOk());
        mvc.perform(get(invitePath(otherToken))).andExpect(status().isOk());
        assertSingleMembershipAndEditing("EDITOR");
        as(owner, delete(path() + "/invite-groups/EDITOR")).andExpect(status().isNoContent());
        mvc.perform(post("/api/v1/webhooks/kakao/share").header("Authorization", "KakaoAK share-webhook-test-key")
                .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isNoContent());
        String fresh = invite("EDITOR");
        assertThat(fresh).isNotIn(firstEditor, expiredEditor, latestEditor);
        as(owner, get(path() + "/invite-groups")).andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void cancellingLatestRoleGroupNeverRevivesOlderPermissionAndResharingCanIssueNewerPermission() throws Exception {
        String oldEditor = invite("EDITOR");
        accept(oldEditor).andExpect(status().isOk());
        String viewer = invite("VIEWER");
        accept(viewer).andExpect(status().isOk());
        as(owner, delete(path() + "/invite-groups/VIEWER")).andExpect(status().isNoContent());
        setRole("VIEWER");
        accept(oldEditor).andExpect(status().isOk());
        assertSingleMembershipAndEditing("VIEWER");
        String freshEditor = invite("EDITOR");
        assertThat(freshEditor).isNotEqualTo(oldEditor);
        accept(freshEditor).andExpect(status().isOk());
        assertSingleMembershipAndEditing("EDITOR");
    }

    @Test
    void groupManagementIsOwnerOnlyAndRejectsInvalidRoles() throws Exception {
        String token = invite("EDITOR");
        mvc.perform(get(path() + "/invite-groups")).andExpect(status().isUnauthorized());
        mvc.perform(delete(path() + "/invite-groups/EDITOR")).andExpect(status().isUnauthorized());
        as(visitor, get(path() + "/invite-groups")).andExpect(status().isForbidden());
        as(visitor, delete(path() + "/invite-groups/EDITOR")).andExpect(status().isForbidden());
        for (String invalid : List.of("OWNER", "UNKNOWN")) {
            as(owner, delete(path() + "/invite-groups/" + invalid)).andExpect(status().isBadRequest());
        }
        mvc.perform(get(invitePath(token))).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void preparingSameRoleRepeatedlyReusesOneLinkEvenAfterAcceptance(String role) throws Exception {
        String token = invite(role);
        JsonNode preview = read(mvc.perform(get(invitePath(token))).andExpect(status().isOk()));
        assertThat(invite(role)).isEqualTo(token);
        accept(token).andExpect(status().isOk());
        assertThat(invite(role)).isEqualTo(token);
        as(owner, get(path() + "/invites")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].expiresAt").value(preview.path("expiresAt").asText()));
        assertSingleMembershipAndEditing(role);
    }

    @Test
    void changingBackToEditorIssuesANewLinkRatherThanReusingOlderEditorPermission() throws Exception {
        String editor = invite("EDITOR");
        accept(editor).andExpect(status().isOk());
        String viewer = invite("VIEWER");
        accept(viewer).andExpect(status().isOk());
        String newestEditor = invite("EDITOR");
        assertThat(newestEditor).isNotEqualTo(editor).isNotEqualTo(viewer);
        accept(newestEditor).andExpect(status().isOk());
        accept(viewer).andExpect(status().isOk());
        assertSingleMembershipAndEditing("EDITOR");
        assertThat(invite("EDITOR")).isEqualTo(newestEditor);
    }

    @Test
    void removingMemberThenRequestingSameRoleCreatesFreshUsableLink() throws Exception {
        String editor = invite("EDITOR");
        accept(editor).andExpect(status().isOk());
        as(owner, delete(path() + "/members/" + memberId)).andExpect(status().isNoContent());
        String fresh = invite("EDITOR");
        assertThat(fresh).isNotEqualTo(editor);
        assertThat(invite("EDITOR")).isEqualTo(fresh);
        accept(editor).andExpect(status().isForbidden());
        accept(fresh).andExpect(status().isOk());
        assertSingleMembershipAndEditing("EDITOR");
    }

    @Test
    void expiredLatestLinkIsReplacedWithoutReusingOlderSameRoleLink() throws Exception {
        String older = invite("EDITOR");
        invite("VIEWER");
        String expired = invite("EDITOR");
        entityManager.flush();
        jdbc.update("UPDATE course_invites SET expires_at = now() - interval '1 minute' WHERE token = ?", expired);
        entityManager.clear();
        String fresh = invite("EDITOR");
        assertThat(fresh).isNotEqualTo(expired).isNotEqualTo(older);
        assertThat(invite("EDITOR")).isEqualTo(fresh);
        accept(expired).andExpect(status().isBadRequest());
        accept(fresh).andExpect(status().isOk());
    }

    @Test
    void cancelledOnlyLinkIsReplacedRatherThanReturnedAgain() throws Exception {
        String token = invite("VIEWER");
        as(owner, delete(path() + "/invites/" + token)).andExpect(status().isNoContent());
        String fresh = invite("VIEWER");
        assertThat(fresh).isNotEqualTo(token);
        assertThat(invite("VIEWER")).isEqualTo(fresh);
        accept(token).andExpect(status().isNotFound());
        accept(fresh).andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void newerInviteReplacesPermissionWithoutAddingMembershipAndOldLinksCannotUndoIt(String originalRole) throws Exception {
        String originalToken = invite(originalRole);
        accept(originalToken).andExpect(status().isOk());
        String latestRole = oppositeRole(originalRole);
        String latestToken = invite(latestRole);
        accept(latestToken)
                .andExpect(status().isOk()).andExpect(jsonPath("$.alreadyMember").value(true))
                .andExpect(jsonPath("$.joined").value(false));
        assertSingleMembershipAndEditing(latestRole);

        for (String token : List.of(originalToken, latestToken, originalToken)) {
            accept(token).andExpect(status().isOk()).andExpect(jsonPath("$.alreadyMember").value(true));
            assertSingleMembershipAndEditing(latestRole);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void acceptingOlderUnusedInviteAfterNewerInviteCannotReplaceLatestPermission(String latestRole) throws Exception {
        String olderToken = invite(oppositeRole(latestRole));
        String newerToken = invite(latestRole);
        accept(newerToken).andExpect(status().isOk()).andExpect(jsonPath("$.joined").value(true));
        accept(olderToken).andExpect(status().isOk()).andExpect(jsonPath("$.alreadyMember").value(true));
        assertSingleMembershipAndEditing(latestRole);
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void ownerRoleChangeInvalidatesEveryPreviouslyIssuedInviteButAllowsANewInvite(String ownerRole) throws Exception {
        String originalToken = invite(oppositeRole(ownerRole));
        accept(originalToken).andExpect(status().isOk());
        // Even a never-accepted link issued after the first acceptance precedes the owner's decision.
        invite(ownerRole);
        String unusedToken = invite(oppositeRole(ownerRole));
        assertThat(unusedToken).isNotEqualTo(originalToken);
        setRole(ownerRole);
        for (String token : List.of(originalToken, unusedToken)) {
            accept(token).andExpect(status().isOk());
            assertSingleMembershipAndEditing(ownerRole);
        }
        accept(invite(oppositeRole(ownerRole))).andExpect(status().isOk());
        assertSingleMembershipAndEditing(oppositeRole(ownerRole));
    }

    @Test
    void removingMemberBlocksAllPreviouslyIssuedLinksAndFreshRejoinDoesNotRestoreOldEditorRole() throws Exception {
        String editorToken = invite("EDITOR");
        accept(editorToken).andExpect(status().isOk());
        invite("VIEWER");
        String unusedEditorToken = invite("EDITOR");
        assertThat(unusedEditorToken).isNotEqualTo(editorToken);
        String unusedViewerToken = invite("VIEWER");
        as(owner, delete(path() + "/members/" + memberId)).andExpect(status().isNoContent());
        entityManager.flush();
        entityManager.clear();
        assertThat(membershipCount()).isZero();
        for (String token : List.of(editorToken, unusedEditorToken, unusedViewerToken)) {
            accept(token).andExpect(status().isForbidden());
            assertThat(membershipCount()).isZero();
        }
        saveAccommodation(member, "Removed member hotel", "Forbidden").andExpect(status().isForbidden());
        as(member, patch(path()).contentType(MediaType.APPLICATION_JSON).content(updatedItinerary()))
                .andExpect(status().isForbidden());
        accept(invite("VIEWER")).andExpect(status().isOk()).andExpect(jsonPath("$.joined").value(true));
        accept(unusedEditorToken).andExpect(status().isOk());
        assertSingleMembershipAndEditing("VIEWER");

        // The per-user cutoff must not revoke a reusable link for other invitees.
        as(visitor, post(invitePath(unusedEditorToken) + "/accept")).andExpect(status().isOk())
                .andExpect(jsonPath("$.joined").value(true));
        saveAccommodation(visitor, "Another editor hotel", "Allowed").andExpect(status().isOk());
        assertSingleMembershipAndEditing("VIEWER");
    }

    @Test
    void cancellingAnUnusedNewerLinkDoesNotChangeExistingMemberPermission() throws Exception {
        accept(invite("EDITOR")).andExpect(status().isOk());
        String newerToken = invite("VIEWER");
        as(owner, delete(path() + "/invites/" + newerToken)).andExpect(status().isNoContent());
        accept(newerToken).andExpect(status().isNotFound());
        assertSingleMembershipAndEditing("EDITOR");
    }

    @Test
    void legacyMemberCannotBeChangedByAPreexistingLinkButCanAcceptANewlyIssuedRole() throws Exception {
        accept(invite("EDITOR")).andExpect(status().isOk());
        String oldViewerToken = invite("VIEWER");
        entityManager.flush();
        jdbc.update("UPDATE course_members SET last_applied_invite_id = NULL WHERE course_id = ? AND user_id = ?",
                courseId, memberId);
        entityManager.clear();

        accept(oldViewerToken).andExpect(status().isOk());
        assertSingleMembershipAndEditing("EDITOR");
        accept(invite("VIEWER")).andExpect(status().isOk());
        assertSingleMembershipAndEditing("VIEWER");
    }

    @Test
    void issuingNewInviteInitializesLegacyMemberBeforeItsFirstPostUpgradeAcceptance() throws Exception {
        String oldToken = invite("EDITOR");
        accept(oldToken).andExpect(status().isOk());
        entityManager.flush();
        jdbc.update("UPDATE course_members SET last_applied_invite_id = NULL WHERE course_id = ? AND user_id = ?",
                courseId, memberId);
        entityManager.clear();

        String newToken = invite("VIEWER");
        accept(newToken).andExpect(status().isOk());
        accept(oldToken).andExpect(status().isOk());
        assertSingleMembershipAndEditing("VIEWER");
    }

    @Test
    void legacyRejoinedMemberKeepsCurrentPermissionWhenReplayingALinkFromBeforeRemoval() throws Exception {
        String removedEditorToken = invite("EDITOR");
        accept(removedEditorToken).andExpect(status().isOk());
        as(owner, delete(path() + "/members/" + memberId)).andExpect(status().isNoContent());
        accept(invite("VIEWER")).andExpect(status().isOk());
        entityManager.flush();
        jdbc.update("UPDATE course_members SET last_applied_invite_id = NULL WHERE course_id = ? AND user_id = ?",
                courseId, memberId);
        entityManager.clear();

        accept(removedEditorToken).andExpect(status().isOk()).andExpect(jsonPath("$.alreadyMember").value(true));
        assertSingleMembershipAndEditing("VIEWER");
        accept(invite("EDITOR")).andExpect(status().isOk());
        assertSingleMembershipAndEditing("EDITOR");
    }

    @Test
    void cancellingLatestAcceptedLinkThenChangingRoleCannotMakeAnOlderEditorLinkEffectiveAgain() throws Exception {
        String olderEditorToken = invite("EDITOR");
        accept(olderEditorToken).andExpect(status().isOk());
        String latestViewerToken = invite("VIEWER");
        accept(latestViewerToken).andExpect(status().isOk());
        as(owner, delete(path() + "/invites/" + latestViewerToken)).andExpect(status().isNoContent());
        setRole("VIEWER");

        accept(olderEditorToken).andExpect(status().isOk());
        accept(latestViewerToken).andExpect(status().isNotFound());
        assertSingleMembershipAndEditing("VIEWER");
        accept(invite("EDITOR")).andExpect(status().isOk());
        assertSingleMembershipAndEditing("EDITOR");
    }

    @Test
    void onlyVerifiedKakaoDeliveryCompletesTheMatchingAttemptAndLinkCanStillBeCancelled() throws Exception {
        String token = invite("EDITOR");
        String requestId = UUID.randomUUID().toString();
        String statusUrl = invitePath(token) + "/kakao-shares/" + requestId;
        String payload = mapper.writeValueAsString(Map.of("invite_token", token, "share_request_id", requestId,
                "CHAT_TYPE", "MultiChat", "HASH_CHAT_ID", "test-chat"));
        mvc.perform(get(statusUrl)).andExpect(status().isUnauthorized());
        as(visitor, get(statusUrl)).andExpect(status().isForbidden());
        as(owner, get(statusUrl)).andExpect(status().isOk()).andExpect(jsonPath("$.shared").value(false));
        for (String key : List.of("", "KakaoAK incorrect-key")) {
            mvc.perform(post("/api/v1/webhooks/kakao/share").header("Authorization", key)
                    .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isUnauthorized());
        }
        as(owner, get(statusUrl)).andExpect(jsonPath("$.shared").value(false));
        for (int retry = 0; retry < 2; retry++) {
            mvc.perform(post("/api/v1/webhooks/kakao/share").header("Authorization", "KakaoAK share-webhook-test-key")
                    .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isNoContent());
            entityManager.flush();
            entityManager.clear();
        }
        as(owner, get(statusUrl)).andExpect(status().isOk()).andExpect(jsonPath("$.shared").value(true))
                .andExpect(header().string("Cache-Control", "no-store"));
        as(owner, get(invitePath(token) + "/kakao-shares/" + UUID.randomUUID()))
                .andExpect(jsonPath("$.shared").value(false));
        // Sending the invitation never creates a membership; acceptance is a separate action.
        as(owner, get(path() + "/members")).andExpect(jsonPath("$.length()").value(1));
        as(owner, delete(path() + "/invites/" + token)).andExpect(status().isNoContent());
        entityManager.flush();
        entityManager.clear();
        as(owner, get(statusUrl)).andExpect(status().isNotFound());
        mvc.perform(post("/api/v1/webhooks/kakao/share").header("Authorization", "KakaoAK share-webhook-test-key")
                .contentType(MediaType.APPLICATION_JSON).content(payload)).andExpect(status().isNoContent());
    }

    @BeforeEach
    void createCourseAndUsers() throws Exception {
        owner = cookie(newUser());
        UserModel recipient = newUser();
        memberId = recipient.getUserId();
        member = cookie(recipient);
        visitor = cookie(newUser());
        OffsetDateTime now = OffsetDateTime.now();
        spotId = spots.save(SpotJpaEntity.builder().title("Shared itinerary spot")
                .sourceType(SpotSourceType.NATIVE).category("test").status(SpotStatus.ACTIVE)
                .createdAt(now).updatedAt(now).build()).getSpotId();
        courseId = read(as(owner, post("/api/v1/courses").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of(
                        "title", "Friends trip", "visibility", "PUBLIC",
                        "startDate", "2026-10-01", "endDate", "2026-10-02",
                        "days", List.of(Map.of("dayNumber", 1,
                                "spots", List.of(Map.of("spotId", spotId, "memo", "Original memo"))),
                                Map.of("dayNumber", 2, "spots", List.of()))))))
                .andExpect(status().isCreated())).path("courseId").asLong();
        saveAccommodation(owner, "Original hotel", "Owner memo").andExpect(status().isOk());
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void invitePreviewRequiresNoLoginAndAcceptanceGrantsAccuratePermissions(String role) throws Exception {
        String token = invite(role);
        mvc.perform(get(invitePath(token))).andExpect(status().isOk())
                .andExpect(jsonPath("$.courseTitle").value("Friends trip"))
                .andExpect(jsonPath("$.memberRole").value(role));
        mvc.perform(post(invitePath(token) + "/accept")).andExpect(status().isUnauthorized());
        accept(token).andExpect(status().isOk()).andExpect(jsonPath("$.joined").value(true))
                .andExpect(jsonPath("$.alreadyMember").value(false));
        accept(token).andExpect(status().isOk()).andExpect(jsonPath("$.joined").value(false))
                .andExpect(jsonPath("$.alreadyMember").value(true));

        as(member, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.isOwner").value(false))
                .andExpect(jsonPath("$.canEdit").value(role.equals("EDITOR")))
                .andExpect(jsonPath("$.canViewAccommodations").value(true));
        as(member, get("/api/v1/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(courseId))
                .andExpect(jsonPath("$[0].canEdit").value(role.equals("EDITOR")))
                .andExpect(jsonPath("$[0].canViewAccommodations").value(true));
        as(member, get(path() + "/day-accommodations")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Original hotel"))
                .andExpect(jsonPath("$[0].memo").value("Owner memo"));
    }

    @Test
    void viewerCannotModifyItineraryMemoOrAccommodation() throws Exception {
        accept(invite("VIEWER")).andExpect(status().isOk());

        as(member, patch(path()).contentType(MediaType.APPLICATION_JSON).content(updatedItinerary()))
                .andExpect(status().isForbidden());
        saveAccommodation(member, "Changed hotel", "Changed memo").andExpect(status().isForbidden());
        as(member, put(path() + "/day-accommodations").contentType(MediaType.APPLICATION_JSON).content("[]"))
                .andExpect(status().isForbidden());

        as(owner, get(path())).andExpect(jsonPath("$.title").value("Friends trip"))
                .andExpect(jsonPath("$.days[0].spots[0].memo").value("Original memo"));
        as(owner, get(path() + "/day-accommodations")).andExpect(jsonPath("$[0].name").value("Original hotel"));
    }

    @Test
    void editorCanPersistItineraryMemoAndRepeatedAccommodationUpdates() throws Exception {
        accept(invite("EDITOR")).andExpect(status().isOk());

        as(member, patch(path()).contentType(MediaType.APPLICATION_JSON).content(updatedItinerary()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canEdit").value(true));
        saveAccommodation(member, "Shared hotel", "Editor memo").andExpect(status().isOk());
        saveAccommodation(member, "Final hotel", "Final memo").andExpect(status().isOk());

        as(owner, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Edited together"))
                .andExpect(jsonPath("$.days[0].spots").isEmpty())
                .andExpect(jsonPath("$.days[1].spots[0].spotId").value(spotId))
                .andExpect(jsonPath("$.days[1].spots[0].memo").value("Editor itinerary memo"));
        as(owner, get(path() + "/day-accommodations")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Final hotel"))
                .andExpect(jsonPath("$[0].memo").value("Final memo"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void membersCannotManageInvitesMembersVisibilityOrDeleteCourse(String role) throws Exception {
        String token = invite(role);
        accept(token).andExpect(status().isOk());
        as(member, get(path() + "/members")).andExpect(status().isForbidden());
        as(member, get(path() + "/invites")).andExpect(status().isForbidden());
        as(member, post(path() + "/invites").contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberRole\":\"EDITOR\"}")).andExpect(status().isForbidden());
        as(member, delete(path() + "/invites/" + token)).andExpect(status().isForbidden());
        as(member, patch(path() + "/members/" + memberId).contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"EDITOR\"}")).andExpect(status().isForbidden());
        as(member, delete(path() + "/members/" + memberId)).andExpect(status().isForbidden());
        as(member, delete(path())).andExpect(status().isForbidden());
        var update = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(updatedItinerary());
        update.put("visibility", "PRIVATE");
        as(member, patch(path()).contentType(MediaType.APPLICATION_JSON).content(update.toString()))
                .andExpect(status().isForbidden());
    }

    @Test
    void roleChangesApplyImmediatelyAndReacceptingOldLinkCannotOverrideOwnerDecision() throws Exception {
        String editorToken = invite("EDITOR");
        accept(editorToken).andExpect(status().isOk());
        setRole("VIEWER");
        accept(editorToken).andExpect(status().isOk()).andExpect(jsonPath("$.alreadyMember").value(true));
        as(member, get(path())).andExpect(jsonPath("$.canEdit").value(false));
        saveAccommodation(member, "Denied hotel", "Denied memo").andExpect(status().isForbidden());
        as(member, patch(path()).contentType(MediaType.APPLICATION_JSON).content(updatedItinerary()))
                .andExpect(status().isForbidden());
        as(member, get(path() + "/day-accommodations")).andExpect(status().isOk());

        setRole("EDITOR");
        as(member, get(path())).andExpect(jsonPath("$.canEdit").value(true));
        saveAccommodation(member, "Allowed hotel", "Allowed memo").andExpect(status().isOk());
    }

    @Test
    void publicVisitorsCannotReadAccommodationAndRemovingMemberRevokesAccess() throws Exception {
        mvc.perform(get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.canViewAccommodations").value(false));
        as(visitor, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.canViewAccommodations").value(false));
        as(visitor, get(path() + "/day-accommodations")).andExpect(status().isForbidden());
        mvc.perform(get(path() + "/day-accommodations")).andExpect(status().isUnauthorized());

        String token = invite("EDITOR");
        accept(token).andExpect(status().isOk());
        as(owner, delete(path() + "/members/" + memberId)).andExpect(status().isNoContent());
        as(member, get(path())).andExpect(jsonPath("$.canEdit").value(false))
                .andExpect(jsonPath("$.canViewAccommodations").value(false));
        as(member, get(path() + "/day-accommodations")).andExpect(status().isForbidden());
        saveAccommodation(member, "Denied hotel", "Denied memo").andExpect(status().isForbidden());
        accept(token).andExpect(status().isForbidden());
        accept(invite("VIEWER")).andExpect(status().isOk());
        as(member, get(path() + "/day-accommodations")).andExpect(status().isOk());
        saveAccommodation(member, "Still denied", "Denied memo").andExpect(status().isForbidden());
    }

    @Test
    void privateTransitionRevokesMemberAccommodationAccessAndInvite() throws Exception {
        String token = invite("EDITOR");
        accept(token).andExpect(status().isOk());
        var update = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(updatedItinerary());
        update.put("visibility", "PRIVATE");
        as(owner, patch(path()).contentType(MediaType.APPLICATION_JSON).content(update.toString()))
                .andExpect(status().isOk());
        as(member, get(path())).andExpect(status().isForbidden());
        as(member, get(path() + "/day-accommodations")).andExpect(status().isForbidden());
        saveAccommodation(member, "Denied hotel", "Denied memo").andExpect(status().isForbidden());
        mvc.perform(get(invitePath(token))).andExpect(status().isNotFound());
        accept(token).andExpect(status().isNotFound());
        as(owner, get(path() + "/day-accommodations")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Original hotel"));
    }

    @Test
    void deletedCourseAccommodationsCannotBeReadOrChangedEvenByOwner() throws Exception {
        as(owner, delete(path())).andExpect(status().isOk());
        as(owner, get(path() + "/day-accommodations")).andExpect(status().isNotFound());
        saveAccommodation(owner, "Deleted hotel", "Deleted memo").andExpect(status().isNotFound());
    }

    @Test
    void ownerCanCancelLinkAndCancelledLinkCannotBePreviewedOrAccepted() throws Exception {
        String token = invite("VIEWER");
        as(owner, delete(path() + "/invites/" + token)).andExpect(status().isNoContent());
        mvc.perform(get(invitePath(token))).andExpect(status().isNotFound());
        accept(token).andExpect(status().isNotFound());
    }

    private String updatedItinerary() throws Exception {
        JsonNode course = read(as(owner, get(path())).andExpect(status().isOk()));
        return mapper.writeValueAsString(Map.of(
                "title", "Edited together", "startDate", "2026-10-01", "endDate", "2026-10-02",
                "expectedUpdatedAt", course.path("updatedAt").asText(),
                "days", List.of(Map.of("dayNumber", 1, "spots", List.of()),
                        Map.of("dayNumber", 2, "spots", List.of(Map.of("spotId", spotId, "memo", "Editor itinerary memo"))))));
    }

    private long membershipCount() {
        return jdbc.queryForObject("SELECT count(*) FROM course_members WHERE course_id = ? AND user_id = ?",
                Long.class, courseId, memberId);
    }

    private void assertSingleMembershipAndEditing(String role) throws Exception {
        entityManager.flush();
        entityManager.clear();
        assertThat(membershipCount()).as("one persisted permission per course and person").isEqualTo(1L);
        as(owner, get(path() + "/members")).andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.userId == " + memberId + ")].role")
                        .value(org.hamcrest.Matchers.contains(role)));
        boolean editor = role.equals("EDITOR");
        as(member, get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.canEdit").value(editor));
        as(member, get(path() + "/day-accommodations")).andExpect(status().isOk());
        as(member, patch(path()).contentType(MediaType.APPLICATION_JSON).content(updatedItinerary()))
                .andExpect(editor ? status().isOk() : status().isForbidden());
        String hotelBefore = read(as(owner, get(path() + "/day-accommodations"))).get(0).path("name").asText();
        saveAccommodation(member, "Permission checked hotel", "Permission checked memo")
                .andExpect(editor ? status().isOk() : status().isForbidden());
        as(owner, get(path() + "/day-accommodations"))
                .andExpect(jsonPath("$[0].name").value(editor ? "Permission checked hotel" : hotelBefore));
    }

    private static String oppositeRole(String role) { return role.equals("EDITOR") ? "VIEWER" : "EDITOR"; }

    private ResultActions saveAccommodation(Cookie user, String name, String memo) throws Exception {
        return as(user, put(path() + "/day-accommodations").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(List.of(Map.of("dayNumber", 1, "name", name, "memo", memo)))));
    }

    private void setRole(String role) throws Exception {
        as(owner, patch(path() + "/members/" + memberId).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("role", role)))).andExpect(status().isNoContent());
    }

    private String legacyDuplicate(String originalToken) {
        entityManager.flush();
        String duplicate = "legacy-" + UUID.randomUUID();
        jdbc.update("INSERT INTO course_invites (course_id, created_by_user_id, token, member_role, expires_at, created_at) "
                + "SELECT course_id, created_by_user_id, ?, member_role, expires_at, created_at + interval '1 minute' "
                + "FROM course_invites WHERE token = ?", duplicate, originalToken);
        entityManager.clear();
        return duplicate;
    }

    private String invite(String role) throws Exception {
        return read(as(owner, post(path() + "/invites").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("memberRole", role))))
                .andExpect(status().isOk())).path("token").asText();
    }

    private ResultActions accept(String token) throws Exception { return as(member, post(invitePath(token) + "/accept")); }
    private String invitePath(String token) { return "/api/v1/course-invites/" + token; }
    private String path() { return "/api/v1/courses/" + courseId; }
    private Cookie cookie(UserModel user) { return new Cookie("access_token", tokens.create(user).accessToken()); }
    private UserModel newUser() { return users.save(UserModel.create("sharing" + UUID.randomUUID().toString().substring(0, 12), null, null)); }
    private ResultActions as(Cookie user, MockHttpServletRequestBuilder request) throws Exception { return mvc.perform(request.cookie(user)); }
    private JsonNode read(ResultActions result) throws Exception { return mapper.readTree(result.andReturn().getResponse().getContentAsString()); }
}
