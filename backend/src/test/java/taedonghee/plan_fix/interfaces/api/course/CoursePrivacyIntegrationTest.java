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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.SpotStatus;
import taedonghee.plan_fix.domain.user.UserModel;
import taedonghee.plan_fix.domain.user.UserRepository;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaEntity;
import taedonghee.plan_fix.infrastructure.course.CourseInviteJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseLikeJpaEntity;
import taedonghee.plan_fix.infrastructure.course.CourseLikeJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberJpaEntity;
import taedonghee.plan_fix.infrastructure.course.CourseMemberJpaRepository;
import taedonghee.plan_fix.infrastructure.course.CourseMemberRole;
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

/**
 * Owner-only privacy regression coverage through real controllers, cookie authentication and PostgreSQL.
 * Fixtures written directly through repositories represent memberships, likes and links from older versions.
 */
@SpringBootTest(properties = "security.jwt.secret=private-course-regression-test-key-not-a-production-secret")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CoursePrivacyIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired JwtTokenProvider tokens;
    @Autowired SpotJpaRepository spots;
    @Autowired CourseJpaRepository courses;
    @Autowired CourseMemberJpaRepository members;
    @Autowired CourseInviteJpaRepository invites;
    @Autowired CourseLikeJpaRepository likes;

    private Cookie owner;
    private Cookie stranger;
    private Long ownerId;
    private Long strangerId;
    private Long spotId;
    private long privateId;

    @BeforeEach
    void createIsolatedFixtures() throws Exception {
        UserModel creator = users.save(UserModel.create(username(), null, null));
        UserModel other = users.save(UserModel.create(username(), null, null));
        owner = new Cookie("access_token", tokens.create(creator).accessToken());
        stranger = new Cookie("access_token", tokens.create(other).accessToken());
        ownerId = creator.getUserId();
        strangerId = other.getUserId();
        OffsetDateTime now = OffsetDateTime.now();
        spotId = spots.save(SpotJpaEntity.builder().title("Privacy regression spot")
                .sourceType(SpotSourceType.NATIVE).category("test").status(SpotStatus.ACTIVE)
                .createdAt(now).updatedAt(now).build()).getSpotId();
        privateId = createCourse("PRIVATE");
    }

    @Test
    void privateCreationPersistsAndOwnerCanReadFullItinerary() throws Exception {
        assertThat(courses.findById(privateId).orElseThrow().getVisibility().name()).isEqualTo("PRIVATE");
        as(owner, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.isOwner").value(true))
                .andExpect(jsonPath("$.days[0].spots[0].memo").value("PRIVATE-MEMO"));
    }

    @Test
    void anonymousDirectReadIsForbidden() throws Exception {
        assertNoPrivateContent(mvc.perform(get(path())).andExpect(status().isForbidden()));
    }

    @Test
    void unrelatedAccountDirectReadIsForbidden() throws Exception {
        assertNoPrivateContent(as(stranger, get(path())).andExpect(status().isForbidden()));
    }

    @Test
    void ownCourseListIsIsolatedBetweenUsers() throws Exception {
        as(owner, get("/api/v1/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(privateId));
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
        mvc.perform(get("/api/v1/courses")).andExpect(status().isUnauthorized());
    }

    @Test
    void publicCourseOwnershipDependsOnAuthenticatedViewer() throws Exception {
        setVisibility("PUBLIC");

        for (Cookie viewer : new Cookie[]{null, owner, stranger}) {
            MockHttpServletRequestBuilder request = get(path());
            if (viewer != null) request.cookie(viewer);
            mvc.perform(request).andExpect(status().isOk())
                    .andExpect(jsonPath("$.userId").value(ownerId))
                    .andExpect(jsonPath("$.isOwner").value(viewer == owner))
                    .andExpect(jsonPath("$.canEdit").value(viewer == owner));
        }
    }

    @Test
    void discoveringAnotherTravelersPublicCourseDoesNotAddItToMyCourses() throws Exception {
        setVisibility("PUBLIC");

        as(stranger, get("/api/v1/courses/public").param("sort", "random"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].courseId").value(privateId));
        as(stranger, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.isOwner").value(false))
                .andExpect(jsonPath("$.canEdit").value(false));
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
        as(owner, get("/api/v1/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(privateId))
                .andExpect(jsonPath("$[0].isOwner").value(true));
    }

    @ParameterizedTest
    @ValueSource(strings = {"latest", "popular", "random"})
    void allPublicListSortsExcludePrivateCoursesForAnonymousAndLoggedInUsers(String sort) throws Exception {
        long publicId = createCourse("PUBLIC");
        for (Cookie viewer : new Cookie[]{null, owner, stranger}) {
            MockHttpServletRequestBuilder request = get("/api/v1/courses/public").param("sort", sort);
            if (viewer != null) request.cookie(viewer);
            mvc.perform(request).andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalCount").value(1))
                    .andExpect(jsonPath("$.items.length()").value(1))
                    .andExpect(jsonPath("$.items[0].courseId").value(publicId));
        }
    }

    @Test
    void unrelatedUserCannotModifyDeleteOrInviteIntoPrivateCourse() throws Exception {
        as(stranger, patch(path()).contentType(MediaType.APPLICATION_JSON).content(payload("PUBLIC")))
                .andExpect(status().isForbidden());
        as(stranger, delete(path())).andExpect(status().isForbidden());
        as(stranger, post(path() + "/invites").contentType(MediaType.APPLICATION_JSON)
                .content("{\"memberRole\":\"VIEWER\"}")).andExpect(status().isForbidden());
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void legacyPrivateMemberCannotReadItineraryOrFindCourseInOwnList(String role) throws Exception {
        addLegacyMember(role);

        assertNoPrivateContent(as(stranger, get(path())).andExpect(status().isForbidden()));
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$").isEmpty());
        as(owner, get("/api/v1/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(privateId));
    }

    @ParameterizedTest
    @ValueSource(strings = {"PRIVATE", "PUBLIC"})
    void legacyPrivateEditorCannotModifyOrPublishOwnersCourse(String requestedVisibility) throws Exception {
        addLegacyMember("EDITOR");

        as(stranger, patch(path()).contentType(MediaType.APPLICATION_JSON)
                .content(payload(requestedVisibility, "UNAUTHORIZED-TITLE"))).andExpect(status().isForbidden());
        assertPrivateCourseUnchanged();
    }

    @Test
    void privateAccommodationIsVisibleOnlyToOwner() throws Exception {
        as(owner, put(path() + "/day-accommodations").contentType(MediaType.APPLICATION_JSON)
                .content("[{\"dayNumber\":1,\"name\":\"PRIVATE-HOTEL\",\"memo\":\"PRIVATE-HOTEL-MEMO\"}]"))
                .andExpect(status().isOk());
        as(owner, get(path() + "/day-accommodations")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("PRIVATE-HOTEL"));
        mvc.perform(get(path() + "/day-accommodations")).andExpect(status().isUnauthorized());
        var strangerResponse = as(stranger, get(path() + "/day-accommodations")).andReturn().getResponse();
        assertThat(strangerResponse.getContentAsString()).doesNotContain("PRIVATE-HOTEL", "PRIVATE-HOTEL-MEMO");
        assertThat(strangerResponse.getStatus()).as("denied accommodation access must return 403").isEqualTo(403);
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void publicCourseInviteStillAllowsMembersToReadAndFindJoinedCourse(String role) throws Exception {
        setVisibility("PUBLIC");
        String invite = invite(role);
        mvc.perform(get("/api/v1/course-invites/" + invite)).andExpect(status().isOk())
                .andExpect(jsonPath("$.courseTitle").value("PRIVATE-TITLE"));
        as(stranger, post("/api/v1/course-invites/" + invite + "/accept")).andExpect(status().isOk());
        as(stranger, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andExpect(jsonPath("$.isOwner").value(false))
                .andExpect(jsonPath("$.canEdit").value("EDITOR".equals(role)))
                .andExpect(jsonPath("$.days[0].spots[0].memo").value("PRIVATE-MEMO"));
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(privateId));
        as(owner, delete(path() + "/members/" + strangerId)).andExpect(status().isNoContent());
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void publicEditorCanEditContentButCannotMakeOwnersCoursePrivate() throws Exception {
        setVisibility("PUBLIC");
        String invite = invite("EDITOR");
        as(stranger, post("/api/v1/course-invites/" + invite + "/accept")).andExpect(status().isOk());

        as(stranger, patch(path()).contentType(MediaType.APPLICATION_JSON).content(payload("PUBLIC", "EDITOR-UPDATED-TITLE")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("EDITOR-UPDATED-TITLE"));
        as(stranger, patch(path()).contentType(MediaType.APPLICATION_JSON).content(payload("PRIVATE")))
                .andExpect(status().isForbidden());
        assertThat(courses.findById(privateId).orElseThrow().getVisibility().name()).isEqualTo("PUBLIC");
        assertThat(courses.findById(privateId).orElseThrow().getTitle()).isEqualTo("EDITOR-UPDATED-TITLE");
        assertThat(members.existsByCourseIdAndUserId(privateId, strangerId)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"VIEWER", "EDITOR"})
    void ownerCannotInviteOthersToPrivateCourse(String role) throws Exception {
        as(owner, post(path() + "/invites").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("memberRole", role))))
                .andExpect(status().isBadRequest());
        assertThat(invites.findByCourseIdOrderByCreatedAtDesc(privateId)).isEmpty();
        assertPrivateCourseUnchanged();
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void stalePrivateInviteCannotRevealTitleOrGrantAccessEvenToExistingMember(boolean alreadyMember) throws Exception {
        String token = addLegacyInvite();
        if (alreadyMember) addLegacyMember("VIEWER");

        for (Cookie viewer : new Cookie[]{null, owner, stranger}) {
            MockHttpServletRequestBuilder request = get("/api/v1/course-invites/" + token);
            if (viewer != null) request.cookie(viewer);
            assertNoPrivateContent(mvc.perform(request).andExpect(status().isNotFound()));
        }
        for (Cookie viewer : new Cookie[]{owner, stranger}) {
            assertNoPrivateContent(as(viewer, post("/api/v1/course-invites/" + token + "/accept"))
                    .andExpect(status().isNotFound()));
        }
        assertThat(members.existsByCourseIdAndUserId(privateId, strangerId)).isEqualTo(alreadyMember);
        as(stranger, get(path())).andExpect(status().isForbidden());
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void publicToPrivateRevokesMembersAndInviteLinksPermanently() throws Exception {
        setVisibility("PUBLIC");
        String acceptedToken = invite("EDITOR");
        String pendingToken = invite("VIEWER");
        as(stranger, post("/api/v1/course-invites/" + acceptedToken + "/accept")).andExpect(status().isOk());
        assertThat(members.existsByCourseIdAndUserId(privateId, strangerId)).isTrue();

        setVisibility("PRIVATE");

        assertThat(members.findByCourseIdOrderByCreatedAtAsc(privateId)).isEmpty();
        assertThat(invites.findByCourseIdOrderByCreatedAtDesc(privateId)).isEmpty();
        as(owner, get(path() + "/members")).andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].userId").value(ownerId));
        as(owner, get(path() + "/invites")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        assertNoPrivateContent(as(stranger, get(path())).andExpect(status().isForbidden()));
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        assertRevokedInvite(acceptedToken);
        assertRevokedInvite(pendingToken);

        setVisibility("PUBLIC");

        assertThat(members.findByCourseIdOrderByCreatedAtAsc(privateId)).isEmpty();
        assertThat(invites.findByCourseIdOrderByCreatedAtDesc(privateId)).isEmpty();
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        as(stranger, patch(path()).contentType(MediaType.APPLICATION_JSON).content(payload("PUBLIC")))
                .andExpect(status().isForbidden());
        assertRevokedInvite(acceptedToken);
        assertRevokedInvite(pendingToken);
    }

    @Test
    void strangerMustNotReadPrivateItineraryByLikingCourseId() throws Exception {
        as(stranger, get(path())).andExpect(status().isForbidden());
        assertNoPrivateContent(as(stranger, post(path() + "/like")).andExpect(status().isForbidden()));
        as(stranger, get("/api/v1/wishlist/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        assertThat(likes.findByUserIdAndCourseId(strangerId, privateId)).isEmpty();
    }

    @Test
    void legacyLikeCannotExposePrivateCourseInWishlist() throws Exception {
        likes.saveAndFlush(CourseLikeJpaEntity.builder().userId(strangerId).courseId(privateId)
                .createdAt(OffsetDateTime.now()).build());

        as(stranger, get("/api/v1/wishlist/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void publishingLegacyPrivateCourseCannotRestoreOldMembersInvitesOrOthersLikes() throws Exception {
        addLegacyMember("EDITOR");
        String token = addLegacyInvite();
        likes.saveAndFlush(CourseLikeJpaEntity.builder().userId(strangerId).courseId(privateId)
                .createdAt(OffsetDateTime.now()).build());
        as(owner, post(path() + "/like")).andExpect(status().isOk());

        setVisibility("PUBLIC");

        assertThat(members.findByCourseIdOrderByCreatedAtAsc(privateId)).isEmpty();
        assertThat(invites.findByCourseIdOrderByCreatedAtDesc(privateId)).isEmpty();
        assertThat(likes.findByUserIdAndCourseId(strangerId, privateId)).isEmpty();
        assertThat(likes.findByUserIdAndCourseId(ownerId, privateId)).isPresent();
        assertThat(courses.findById(privateId).orElseThrow().getLikeCount()).isEqualTo(1);
        assertRevokedInvite(token);
        as(stranger, get("/api/v1/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        as(stranger, get("/api/v1/wishlist/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        as(stranger, patch(path()).contentType(MediaType.APPLICATION_JSON).content(payload("PUBLIC")))
                .andExpect(status().isForbidden());
        mvc.perform(get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.visibility").value("PUBLIC"));
    }

    @Test
    void ownerCanLikeAndFindOwnPrivateCourseInWishlist() throws Exception {
        as(owner, post(path() + "/like")).andExpect(status().isOk());
        as(owner, get("/api/v1/wishlist/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(privateId))
                .andExpect(jsonPath("$[0].days[0].spots[0].memo").value("PRIVATE-MEMO"));
        as(owner, get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.visibility").value("PRIVATE"));
    }

    @Test
    void privateTransitionRemovesOthersLikesPermanentlyAndPreservesOwnersLikeAndCount() throws Exception {
        setVisibility("PUBLIC");
        as(owner, post(path() + "/like")).andExpect(status().isOk());
        as(stranger, post(path() + "/like")).andExpect(status().isOk());
        as(stranger, get("/api/v1/wishlist/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(privateId));
        assertThat(courses.findById(privateId).orElseThrow().getLikeCount()).isEqualTo(2);

        setVisibility("PRIVATE");

        as(stranger, get(path())).andExpect(status().isForbidden());
        as(stranger, get("/api/v1/wishlist/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        assertThat(likes.findByUserIdAndCourseId(strangerId, privateId)).isEmpty();
        assertThat(likes.findByUserIdAndCourseId(ownerId, privateId)).isPresent();
        assertThat(courses.findById(privateId).orElseThrow().getLikeCount()).isEqualTo(1);
        as(owner, get("/api/v1/wishlist/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(privateId))
                .andExpect(jsonPath("$[0].likeCount").value(1));

        setVisibility("PUBLIC");

        as(stranger, get("/api/v1/wishlist/courses")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
        assertThat(likes.findByUserIdAndCourseId(strangerId, privateId)).isEmpty();
        assertThat(courses.findById(privateId).orElseThrow().getLikeCount()).isEqualTo(1);
    }

    @Test
    void invalidPrivateUpdatePreservesVisibilityMembershipInvitesLikesAndStoryLink() throws Exception {
        setVisibility("PUBLIC");
        String token = invite("EDITOR");
        as(stranger, post("/api/v1/course-invites/" + token + "/accept")).andExpect(status().isOk());
        as(owner, post(path() + "/like")).andExpect(status().isOk());
        as(stranger, post(path() + "/like")).andExpect(status().isOk());
        long boardId = read(as(owner, post("/api/v1/boards").contentType(MediaType.APPLICATION_JSON)
                .content(boardPayload(privateId))).andExpect(status().isCreated())).path("boardId").asLong();

        as(owner, patch(path()).contentType(MediaType.APPLICATION_JSON)
                .content(payload("PRIVATE", "INVALID-UPDATE", Long.MAX_VALUE)))
                .andExpect(status().isNotFound());

        as(stranger, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PUBLIC"))
                .andExpect(jsonPath("$.title").value("PRIVATE-TITLE"))
                .andExpect(jsonPath("$.likeCount").value(2));
        assertThat(members.existsByCourseIdAndUserId(privateId, strangerId)).isTrue();
        assertThat(invites.findByToken(token)).isPresent();
        mvc.perform(get("/api/v1/course-invites/" + token)).andExpect(status().isOk());
        assertThat(likes.findByUserIdAndCourseId(strangerId, privateId)).isPresent();
        assertThat(likes.findByUserIdAndCourseId(ownerId, privateId)).isPresent();
        as(stranger, get("/api/v1/wishlist/courses")).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].courseId").value(privateId));
        mvc.perform(get("/api/v1/boards/" + boardId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.courseId").value(privateId));
    }

    @Test
    void creatingStoryWithPrivateCourseRequiresExplicitPublication() throws Exception {
        assertPrivateBoardLinkRejected(as(owner, post("/api/v1/boards").contentType(MediaType.APPLICATION_JSON)
                .content(boardPayload(privateId))));

        assertPrivateCourseUnchanged();
        as(owner, get("/api/v1/boards/mine")).andExpect(status().isOk()).andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void updatingStoryWithPrivateCourseRequiresExplicitPublicationAndPreservesOldLink() throws Exception {
        long publicId = createCourse("PUBLIC");
        long boardId = read(as(owner, post("/api/v1/boards").contentType(MediaType.APPLICATION_JSON)
                .content(boardPayload(publicId))).andExpect(status().isCreated())).path("boardId").asLong();

        assertPrivateBoardLinkRejected(as(owner, patch("/api/v1/boards/" + boardId).contentType(MediaType.APPLICATION_JSON)
                .content(boardPayload(privateId))));

        assertPrivateCourseUnchanged();
        mvc.perform(get("/api/v1/boards/" + boardId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.courseId").value(publicId));
    }

    @Test
    void explicitlyPublishedCourseCanBeLinkedWhenCreatingAndUpdatingStory() throws Exception {
        setVisibility("PUBLIC");
        long boardId = read(as(owner, post("/api/v1/boards").contentType(MediaType.APPLICATION_JSON)
                .content(boardPayload(privateId))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.courseId").value(privateId))).path("boardId").asLong();

        long anotherPublicId = createCourse("PUBLIC");
        as(owner, patch("/api/v1/boards/" + boardId).contentType(MediaType.APPLICATION_JSON)
                .content(boardPayload(anotherPublicId))).andExpect(status().isOk())
                .andExpect(jsonPath("$.courseId").value(anotherPublicId));
        mvc.perform(get(path())).andExpect(status().isOk()).andExpect(jsonPath("$.visibility").value("PUBLIC"));
    }

    @Test
    void makingLinkedCoursePrivateDetachesStoriesWithoutDeletingPublishedContent() throws Exception {
        setVisibility("PUBLIC");
        long boardId = read(as(owner, post("/api/v1/boards").contentType(MediaType.APPLICATION_JSON)
                .content(boardPayload(privateId))).andExpect(status().isCreated())).path("boardId").asLong();

        setVisibility("PRIVATE");

        assertPrivateCourseUnchanged();
        mvc.perform(get("/api/v1/boards/" + boardId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.courseId").isEmpty())
                .andExpect(jsonPath("$.title").value("Privacy regression story"))
                .andExpect(jsonPath("$.content").value("<p>Story content</p>"));
        setVisibility("PUBLIC");
        mvc.perform(get("/api/v1/boards/" + boardId)).andExpect(status().isOk())
                .andExpect(jsonPath("$.courseId").isEmpty());
    }

    @Test
    void staleOwnerTabCannotRepublishPrivateCourse() throws Exception {
        setVisibility("PUBLIC");
        String stale = payload("PUBLIC", "STALE-TITLE");
        setVisibility("PRIVATE");
        as(owner, patch(path()).contentType(MediaType.APPLICATION_JSON).content(stale))
                .andExpect(status().isConflict());
        assertPrivateCourseUnchanged();
    }

    @Test
    void missingVersionCannotOverwriteCourse() throws Exception {
        var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(payload("PUBLIC"));
        body.remove("expectedUpdatedAt");
        as(owner, patch(path()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isConflict());
        assertPrivateCourseUnchanged();
    }

    @Autowired jakarta.persistence.EntityManager entityManager;

    @Test
    void responseTimestampRoundTripsThroughDatabaseAndOrdinarySavePreservesPrivacy() throws Exception {
        JsonNode course = read(as(owner, get(path())).andExpect(status().isOk()));
        entityManager.flush();
        entityManager.clear();
        var body = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(payload("PRIVATE", "UPDATED"));
        body.remove("visibility");
        body.put("expectedUpdatedAt", course.path("updatedAt").asText());
        JsonNode saved = read(as(owner, patch(path()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.visibility").value("PRIVATE")));
        entityManager.flush();
        entityManager.clear();
        body.put("expectedUpdatedAt", saved.path("updatedAt").asText());
        as(owner, patch(path()).contentType(MediaType.APPLICATION_JSON).content(body.toString()))
                .andExpect(status().isOk());
    }

    @Test
    void removedMemberNeedsNewInviteButOtherRecipientsCanStillUseExistingLink() throws Exception {
        setVisibility("PUBLIC");
        String oldToken = invite("EDITOR");
        as(stranger, post("/api/v1/course-invites/" + oldToken + "/accept")).andExpect(status().isOk());
        as(owner, delete(path() + "/members/" + strangerId)).andExpect(status().isNoContent());
        as(stranger, post("/api/v1/course-invites/" + oldToken + "/accept")).andExpect(status().isForbidden());
        assertThat(members.existsByCourseIdAndUserId(privateId, strangerId)).isFalse();
        UserModel another = users.save(UserModel.create(username(), null, null));
        Cookie recipient = new Cookie("access_token", tokens.create(another).accessToken());
        as(recipient, post("/api/v1/course-invites/" + oldToken + "/accept")).andExpect(status().isOk());
        String newToken = invite("VIEWER");
        as(stranger, post("/api/v1/course-invites/" + newToken + "/accept")).andExpect(status().isOk());
        assertThat(members.existsByCourseIdAndUserIdAndRole(privateId, strangerId, CourseMemberRole.VIEWER)).isTrue();
        as(owner, delete(path() + "/members/" + strangerId)).andExpect(status().isNoContent());
        as(stranger, post("/api/v1/course-invites/" + newToken + "/accept")).andExpect(status().isForbidden());
    }

    @Test
    void responseDistinguishesEditorFromOwnerAndViewer() throws Exception {
        setVisibility("PUBLIC");
        as(owner, get(path())).andExpect(jsonPath("$.canEdit").value(true))
                .andExpect(jsonPath("$.isOwner").value(true));
        as(stranger, get(path())).andExpect(jsonPath("$.canEdit").value(false));
        addLegacyMember("EDITOR");
        as(stranger, get(path())).andExpect(jsonPath("$.canEdit").value(true))
                .andExpect(jsonPath("$.isOwner").value(false));
        as(stranger, patch(path()).contentType(MediaType.APPLICATION_JSON).content(payload("PUBLIC", "EDITOR-SAVED")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.canEdit").value(true))
                .andExpect(jsonPath("$.isOwner").value(false));
        as(stranger, put(path() + "/day-accommodations").contentType(MediaType.APPLICATION_JSON).content("[]"))
                .andExpect(status().isOk());
    }

    private void assertPrivateBoardLinkRejected(ResultActions response) throws Exception {
        response.andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("나만 보기 코스는 여행 이야기에 연결할 수 없습니다. 코스를 전체 공개로 변경한 뒤 다시 연결해 주세요."));
    }

    private void assertPrivateCourseUnchanged() throws Exception {
        assertThat(courses.findById(privateId).orElseThrow().getVisibility().name()).isEqualTo("PRIVATE");
        as(owner, get(path())).andExpect(status().isOk())
                .andExpect(jsonPath("$.visibility").value("PRIVATE"))
                .andExpect(jsonPath("$.title").value("PRIVATE-TITLE"))
                .andExpect(jsonPath("$.days[0].spots[0].memo").value("PRIVATE-MEMO"));
        assertNoPrivateContent(mvc.perform(get(path())).andExpect(status().isForbidden()));
    }

    private void assertNoPrivateContent(ResultActions result) throws Exception {
        result.andExpect(jsonPath("$.days").doesNotExist())
                .andExpect(jsonPath("$.courseTitle").doesNotExist());
        assertThat(result.andReturn().getResponse().getContentAsString())
                .doesNotContain("PRIVATE-TITLE", "PRIVATE-DESCRIPTION", "PRIVATE-MEMO");
    }

    private void assertRevokedInvite(String token) throws Exception {
        assertNoPrivateContent(mvc.perform(get("/api/v1/course-invites/" + token)).andExpect(status().isNotFound()));
        as(stranger, post("/api/v1/course-invites/" + token + "/accept")).andExpect(status().isNotFound());
    }

    private void addLegacyMember(String role) {
        members.saveAndFlush(CourseMemberJpaEntity.builder().courseId(privateId).userId(strangerId)
                .role(CourseMemberRole.valueOf(role)).createdAt(OffsetDateTime.now()).build());
    }

    private String addLegacyInvite() {
        String token = UUID.randomUUID().toString();
        OffsetDateTime now = OffsetDateTime.now();
        invites.saveAndFlush(CourseInviteJpaEntity.builder().courseId(privateId).createdByUserId(ownerId)
                .token(token).memberRole(CourseMemberRole.VIEWER).createdAt(now).expiresAt(now.plusDays(1)).build());
        return token;
    }

    private void setVisibility(String visibility) throws Exception {
        as(owner, patch(path()).contentType(MediaType.APPLICATION_JSON).content(payload(visibility)))
                .andExpect(status().isOk());
    }

    private String boardPayload(long courseId) throws Exception {
        return mapper.writeValueAsString(Map.of("courseId", courseId,
                "title", "Privacy regression story", "content", "<p>Story content</p>"));
    }

    private String invite(String role) throws Exception {
        return read(as(owner, post(path() + "/invites").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("memberRole", role))))
                .andExpect(status().isOk())).path("token").asText();
    }

    private long createCourse(String visibility) throws Exception {
        return read(as(owner, post("/api/v1/courses").contentType(MediaType.APPLICATION_JSON)
                .content(payload(visibility))).andExpect(status().isCreated()))
                .path("courseId").asLong();
    }

    private String payload(String visibility) throws Exception {
        return payload(visibility, "PRIVATE-TITLE");
    }

    private String payload(String visibility, String title) throws Exception {
        return payload(visibility, title, spotId);
    }

    private String payload(String visibility, String title, long requestedSpotId) throws Exception {
        var body = new java.util.LinkedHashMap<String, Object>(Map.of("title", title, "description", "PRIVATE-DESCRIPTION",
                "visibility", visibility, "startDate", "2026-10-01", "endDate", "2026-10-01",
                "days", List.of(Map.of("dayNumber", 1,
                        "spots", List.of(Map.of("spotId", requestedSpotId, "memo", "PRIVATE-MEMO"))))));
        if (privateId != 0) body.put("expectedUpdatedAt", courses.findById(privateId).orElseThrow().getUpdatedAt().toString());
        return mapper.writeValueAsString(body);
    }

    private ResultActions as(Cookie user, MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.cookie(user));
    }

    private JsonNode read(ResultActions result) throws Exception {
        return mapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    private String path() { return "/api/v1/courses/" + privateId; }
    private String username() { return "privacy" + UUID.randomUUID().toString().replace("-", "").substring(0, 10); }
}
