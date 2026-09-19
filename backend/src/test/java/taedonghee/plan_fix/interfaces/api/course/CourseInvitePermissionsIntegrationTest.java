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
import taedonghee.plan_fix.infrastructure.security.JwtTokenProvider;
import taedonghee.plan_fix.infrastructure.spot.SpotJpaEntity;
import taedonghee.plan_fix.infrastructure.spot.SpotJpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Exercises shared course permissions using real invite acceptance, cookie authentication and PostgreSQL. */
@SpringBootTest(properties = "security.jwt.secret=private-course-regression-test-key-not-a-production-secret")
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class CourseInvitePermissionsIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired JwtTokenProvider tokens;
    @Autowired SpotJpaRepository spots;

    private Cookie owner;
    private Cookie member;
    private Cookie visitor;
    private Long memberId;
    private Long courseId;
    private Long spotId;

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

    private ResultActions saveAccommodation(Cookie user, String name, String memo) throws Exception {
        return as(user, put(path() + "/day-accommodations").contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(List.of(Map.of("dayNumber", 1, "name", name, "memo", memo)))));
    }

    private void setRole(String role) throws Exception {
        as(owner, patch(path() + "/members/" + memberId).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("role", role)))).andExpect(status().isNoContent());
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
