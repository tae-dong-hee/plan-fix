package taedonghee.plan_fix.domain.course;

import taedonghee.plan_fix.support.error.CoreException;
import taedonghee.plan_fix.support.error.ErrorType;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 코스의 일차(Day)별 spot 목록을 나타내는 도메인 값 객체
 */
public record CourseDayModel(int dayNumber, List<CourseSpotModel> spots,
                             List<CourseTravelTheme> themes, List<CourseTripIdea> tripIdeas) {

    /** null metadata distinguishes an old editor's omitted fields from an explicit clear. */
    public CourseDayModel(int dayNumber, List<CourseSpotModel> spots) {
        this(dayNumber, spots, null, null);
    }

    private static final int SPOTS_PER_DAY_MAX_SIZE = 30;

    public CourseDayModel {
        if (dayNumber < 1) {
            throw new CoreException(ErrorType.BAD_REQUEST, "dayNumber must be greater than or equal to 1. dayNumber=" + dayNumber);
        }
        if (spots == null) {
            throw new CoreException(ErrorType.BAD_REQUEST, "spots must not be null.");
        }
        for (CourseSpotModel spot : spots) {
            if (spot == null) {
                throw new CoreException(ErrorType.BAD_REQUEST, "spot in day must not be null.");
            }
        }
        if (spots.size() > SPOTS_PER_DAY_MAX_SIZE) {
            throw new CoreException(ErrorType.BAD_REQUEST, "spots in a day must not exceed " + SPOTS_PER_DAY_MAX_SIZE + ".");
        }

        // 같은 Day 안에서 spotId 중복 검증
        Set<Long> spotIds = new HashSet<>();
        for (CourseSpotModel spot : spots) {
            if (!spotIds.add(spot.spotId())) {
                throw new CoreException(ErrorType.BAD_REQUEST, "duplicate spotId in same day: " + spot.spotId());
            }
        }

        spots = List.copyOf(spots);
        if (themes != null || tripIdeas != null) {
            CourseDayTheme metadata = new CourseDayTheme(dayNumber, themes, tripIdeas);
            themes = metadata.themes();
            tripIdeas = metadata.tripIdeas();
        }
    }

    public CourseDayTheme dayTheme() {
        return new CourseDayTheme(dayNumber, themes, tripIdeas);
    }
}
