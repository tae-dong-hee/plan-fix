package taedonghee.plan_fix.application.course.ai;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InOrder;
import taedonghee.plan_fix.application.spot.SpotThumbnailResolver;
import taedonghee.plan_fix.domain.spot.SpotImageCandidate;
import taedonghee.plan_fix.domain.spot.SpotModel;
import taedonghee.plan_fix.domain.spot.SpotRepository;
import taedonghee.plan_fix.domain.spot.SpotSourceType;
import taedonghee.plan_fix.domain.spot.TourDataImageRepository;
import taedonghee.plan_fix.domain.course.CourseTripIdea;
import taedonghee.plan_fix.domain.course.CourseTravelTheme;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AiCourseDraftApplicationServiceTest {

    @Test
    void daily_assignments_reach_the_llm_fallback_spot_selection_and_response_metadata() {
        SpotRepository spots = mock(SpotRepository.class);
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        AiCourseLlmPlanner llm = mock(AiCourseLlmPlanner.class);
        var candidates = List.of(DailyCourseThemePlanningTest.spot(1, "카페", "카페/음료", 128.9),
                DailyCourseThemePlanningTest.spot(2, "서핑", "레포츠", 128.901));
        when(spots.searchActive(any(), any(), eq(0), eq(2000))).thenReturn(candidates);
        var assignments = List.of(DailyCourseThemePlanningTest.day(1, CourseTripIdea.CAFE),
                DailyCourseThemePlanningTest.day(2, CourseTripIdea.ACTIVITY));
        var reversed = new LlmCoursePlan(List.of(new LlmCoursePlan.Day(1, List.of(new LlmCoursePlan.Entry(2L, "서핑"))),
                new LlmCoursePlan.Day(2, List.of(new LlmCoursePlan.Entry(1L, "카페")))));
        when(llm.plan(anyList(), anyList(), eq(2), anyList(), any(), eq(assignments))).thenReturn(Optional.of(reversed));
        var service = new AiCourseDraftApplicationService(spots, llm, new AiCoursePlanValidator(),
                new SpotThumbnailResolver(images), new RoadCourseOptimizer(ignored -> Optional.empty()));
        LocalDate date = LocalDate.of(2026, 9, 19);

        var result = service.createDraft(null, new AiCourseCommand("51", null, date, date.plusDays(1),
                List.of(CourseTheme.FOOD), CourseCompanion.COUPLE, List.of(), assignments));

        assertThat(result.generatedBy()).isEqualTo("RULE_BASED");
        assertThat(result.days().get(0).spots()).extracting(AiCourseDraftResult.Spot::spotId).containsExactly(1L);
        assertThat(result.days().get(1).spots()).extracting(AiCourseDraftResult.Spot::spotId).containsExactly(2L);
        assertThat(result.days().get(0).themes()).containsExactly(CourseTravelTheme.CAFE);
        assertThat(result.days().get(1).tripIdeas()).containsExactly(CourseTripIdea.ACTIVITY);
        verify(llm).plan(anyList(), anyList(), eq(2), eq(List.of(CourseTheme.FOOD)), eq(CourseCompanion.COUPLE), eq(assignments));
        verify(spots, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void llm과_추천규칙_초안_모두_마지막에_실제_도로거리로_순서를_정한다(boolean useLlm) {
        SpotRepository spots = mock(SpotRepository.class);
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        AiCourseLlmPlanner planner = mock(AiCourseLlmPlanner.class);
        List<SpotModel> candidates = List.of(spot(1, "one.jpg"), spot(2, "two.jpg"), spot(3, "three.jpg"));
        when(spots.searchActive(any(), any(), eq(0), eq(2000))).thenReturn(candidates);
        LlmCoursePlan plan = new LlmCoursePlan(List.of(new LlmCoursePlan.Day(1, List.of(
                new LlmCoursePlan.Entry(1L, "첫 장소의 매력"),
                new LlmCoursePlan.Entry(2L, "두 번째 장소의 매력"),
                new LlmCoursePlan.Entry(3L, "세 번째 장소의 매력")))));
        when(planner.plan(anyList(), anyList(), eq(1), anyList(), any()))
                .thenReturn(useLlm ? Optional.of(plan) : Optional.empty());
        RoadDistanceProvider roads = selected -> {
            long[][] costsById = {{0, 9000, 1000}, {1000, 0, 9000}, {9000, 1000, 0}};
            long[][] costs = new long[selected.size()][selected.size()];
            for (int i = 0; i < selected.size(); i++) {
                for (int j = 0; j < selected.size(); j++) {
                    costs[i][j] = costsById[selected.get(i).spotId().intValue() - 1][selected.get(j).spotId().intValue() - 1];
                }
            }
            return Optional.of(costs);
        };
        AiCourseDraftApplicationService service = new AiCourseDraftApplicationService(spots, planner,
                new AiCoursePlanValidator(), new SpotThumbnailResolver(images), new RoadCourseOptimizer(roads));
        LocalDate date = LocalDate.of(2026, 9, 14);

        AiCourseDraftResult result = service.createDraft(null,
                new AiCourseCommand("51", "150", date, date, List.of(), CourseCompanion.COUPLE, List.of()));

        assertThat(result.generatedBy()).isEqualTo(useLlm ? "LLM" : "RULE_BASED");
        assertThat(result.days().get(0).spots()).extracting(AiCourseDraftResult.Spot::spotId)
                .containsExactly(1L, 3L, 2L);
        assertThat(result.days().get(0).routeStatus()).isEqualTo("ROAD_DISTANCE");
        assertThat(result.days().get(0).drivingDistanceMeters()).isEqualTo(2000L);
        assertThat(result.days().get(0).spots()).extracting(AiCourseDraftResult.Spot::thumbnail)
                .containsExactly("one.jpg", "three.jpg", "two.jpg");
        if (useLlm) assertThat(result.days().get(0).spots().get(1).reason()).isEqualTo("세 번째 장소의 매력");
        verify(spots, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void resolves_photos_after_planning_without_changing_source_quality_scores(boolean useLlm) {
        SpotRepository spots = mock(SpotRepository.class);
        TourDataImageRepository images = mock(TourDataImageRepository.class);
        AiCourseLlmPlanner planner = mock(AiCourseLlmPlanner.class);
        SpotModel representative = spot(1L, "https://images.example.com/representative.jpg");
        SpotModel detailOnly = spot(2L, null);
        double originalQuality = new CoursePlanner().qualityScore(detailOnly);
        when(spots.searchActive(any(), any(), eq(0), eq(2000)))
                .thenReturn(List.of(representative, detailOnly));
        LlmCoursePlan plan = new LlmCoursePlan(List.of(new LlmCoursePlan.Day(1, List.of(
                new LlmCoursePlan.Entry(1L, "첫 장소"), new LlmCoursePlan.Entry(2L, "다음 장소")))));
        when(planner.plan(anyList(), anyList(), eq(1), anyList(), any()))
                .thenReturn(useLlm ? Optional.of(plan) : Optional.empty());
        when(images.findBySpotIds(Set.of(2L))).thenReturn(List.of(
                new SpotImageCandidate(2L, "https://images.example.com/detail.jpg", null)));
        AiCourseDraftApplicationService service = new AiCourseDraftApplicationService(spots, planner,
                new AiCoursePlanValidator(), new SpotThumbnailResolver(images),
                new RoadCourseOptimizer(ignored -> Optional.empty()));
        LocalDate date = LocalDate.of(2026, 9, 13);

        AiCourseDraftResult result = service.createDraft(null,
                new AiCourseCommand("51", "110", date, date, List.of(), CourseCompanion.COUPLE, List.of()));

        assertThat(result.generatedBy()).isEqualTo(useLlm ? "LLM" : "RULE_BASED");
        Map<Long, AiCourseDraftResult.Spot> responseSpots = result.days().stream()
                .flatMap(day -> day.spots().stream())
                .collect(Collectors.toMap(AiCourseDraftResult.Spot::spotId, Function.identity()));
        assertThat(responseSpots).hasSize(2);
        assertThat(responseSpots.get(1L).thumbnail()).isEqualTo(representative.thumbnail());
        assertThat(responseSpots.get(2L).thumbnail()).isEqualTo("https://images.example.com/detail.jpg");
        assertThat(detailOnly.thumbnail()).isNull();
        assertThat(new CoursePlanner().qualityScore(detailOnly)).isEqualTo(originalQuality);
        InOrder order = inOrder(planner, images);
        order.verify(planner).plan(anyList(), anyList(), eq(1), anyList(), any());
        order.verify(images).findBySpotIds(Set.of(2L));
        verifyNoMoreInteractions(images);
        verify(spots, never()).save(any());
    }

    private static SpotModel spot(long id, String thumbnail) {
        return SpotModel.builder().spotId(id).sourceType(SpotSourceType.TOUR_API)
                .title("장소 " + id).category("관광지").thumbnail(thumbnail)
                .latitude(new BigDecimal("37.88")).longitude(new BigDecimal("127.73")).build();
    }
}
