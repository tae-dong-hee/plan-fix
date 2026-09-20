import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Calendar,
  ChevronRight,
  Globe,
  GripVertical,
  Info,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import SpotImage from "@/components/ui/spot-image";
import AiCourseModal from "@/components/ui/ai-course-modal";
import AppNav from "@/components/ui/app-nav";
import DateRangeModal from "@/components/ui/date-range-modal";
import KakaoMap from "@/components/ui/kakao-map";
import CourseMetadata from "@/components/ui/course-metadata";
import SpotSearchModal from "@/components/ui/spot-search-modal";
import AccommodationSearchModal from "@/components/ui/accommodation-search-modal";
import {
  createCourse,
  fetchCourse,
  fetchDayAccommodations,
  saveDayAccommodations,
  updateCourse,
  type CourseGenerationSource,
  type DayAccommodation,
} from "@/services/course";
import { type AiCourseDraft, type AiCourseTheme, type AiCourseTripIdea } from "@/services/ai-course";
import { PopularSpot, UnauthorizedError } from "@/services/spots";
import { CourseAccessError, CourseConflictError } from "@/lib/course-errors";
import { aiCourseNotice } from "@/lib/ai-course-notice";
import { describeDayThemes } from "@/lib/ai-trip-themes";
import { inferCourseSearchRegions } from "@/lib/course-search-regions";
import { formatCourseDuration } from "@/lib/course-duration";

const DRAFT_STORAGE_KEY = "planfix:course-draft";
const ACCOMMODATION_HINT_STORAGE_KEY = "planfix:accommodation-hint-dismissed";

export type DraftSpot = {
  spotId: number;
  title: string;
  category: string;
  region: string | null;
  sigungu: string | null;
  thumbnail: string | null;
  /** 지도 표시용. 이 필드가 생기기 전에 저장된 임시 저장본에는 없을 수 있다. */
  latitude?: number | null;
  longitude?: number | null;
  memo: string;
};

type DraftDayThemes = {
  themes?: AiCourseTheme[];
  tripIdeas?: AiCourseTripIdea[];
};

type SavedCourse = { courseId: number; updatedAt: string; visibility: "PUBLIC" | "PRIVATE" };

export type CourseDraft = {
  savedCourse?: SavedCourse;
  title: string;
  description: string;
  visibility?: "PUBLIC" | "PRIVATE";
  startDate: string;
  endDate: string;
  days: DraftSpot[][];
  dayAccommodations?: Record<number, DayAccommodation>;
  generatedBy?: CourseGenerationSource | null;
  themes?: AiCourseTheme[];
  dayThemes?: Record<number, DraftDayThemes>;
};

function collectDayThemes(days: DraftDayThemes[]): Record<number, DraftDayThemes> {
  return Object.fromEntries(days.flatMap((day, index) =>
    // 빈 배열은 테마 해제 요청이다. 필드가 없는 이전 응답과 구분해 저장한다.
    Array.isArray(day.themes) || Array.isArray(day.tripIdeas)
      ? [[index + 1, { themes: day.themes, tripIdeas: day.tripIdeas }]]
      : [],
  ));
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calculateDayCount(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 1;
  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, Math.min(30, diffDays));
}

function formatDisplayDate(dateStr: string): string {
  return dateStr.replace(/-/g, ".");
}

/** 몇 번째 Day의 몇 번째 장소인지 가리키는 위치. */
type SpotPosition = { dayIndex: number; spotIndex: number };

function SpotDropIndicator({ edge = "top" }: { edge?: "top" | "bottom" }) {
  return (
    <div
      aria-hidden="true"
      data-testid="spot-drop-indicator"
      className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-primary ${edge === "top" ? "-top-[7px]" : "-bottom-[7px]"}`}
    >
      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border-2 border-primary bg-background" />
    </div>
  );
}

export default function CourseCreatePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const todayStr = useMemo(() => formatDate(new Date()), []);
  const defaultEndStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2); // 기본 2박 3일
    return formatDate(d);
  }, []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [generatedBy, setGeneratedBy] = useState<CourseGenerationSource | null>("MANUAL");
  const [themes, setThemes] = useState<AiCourseTheme[]>([]);
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [originalVisibility, setOriginalVisibility] = useState<"PUBLIC" | "PRIVATE" | null>(null);
  const [canChangeVisibility, setCanChangeVisibility] = useState(true);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(defaultEndStr);
  const [days, setDays] = useState<DraftSpot[][]>(() => {
    const initialDaysCount = calculateDayCount(todayStr, defaultEndStr);
    return Array.from({ length: initialDaysCount }, () => []);
  });
  const [dayAccommodations, setDayAccommodations] = useState<Record<number, DayAccommodation>>({});
  const [dayThemes, setDayThemes] = useState<Record<number, DraftDayThemes>>({});
  const [accommodationDayNumber, setAccommodationDayNumber] = useState<number | null>(null);
  const [accommodationsLoaded, setAccommodationsLoaded] = useState(false);
  const [accommodationHintVisible, setAccommodationHintVisible] = useState(() => {
    try {
      return localStorage.getItem(ACCOMMODATION_HINT_STORAGE_KEY) !== "true";
    } catch {
      return true;
    }
  });
  const accommodationHintButtonRef = useRef<HTMLButtonElement>(null);
  const accommodationHintDayIndex = days.findIndex((_, index) => !dayAccommodations[index + 1]);

  const dismissAccommodationHint = (permanently = false) => {
    if (permanently) {
      try {
        localStorage.setItem(ACCOMMODATION_HINT_STORAGE_KEY, "true");
      } catch {
        // 저장소가 제한돼 있어도 현재 화면에서는 안내를 닫을 수 있다.
      }
    }
    accommodationHintButtonRef.current?.focus();
    setAccommodationHintVisible(false);
  };

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 검색 모달 상태
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [activeDayIndex, setActiveDayIndex] = useState<number | null>(null);

  // 여행 기간 선택 모달 상태
  const [dateModalOpen, setDateModalOpen] = useState(false);

  // AI 코스 추천 모달 상태
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiInitialTripType, setAiInitialTripType] = useState<"daytrip" | "overnight" | undefined>();
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const { courseId } = useParams<{ courseId?: string }>();
  const isEditMode = Boolean(courseId);
  const [loadingCourse, setLoadingCourse] = useState(isEditMode);
  const [canEdit, setCanEdit] = useState(!isEditMode);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string>();
  const [needsReload, setNeedsReload] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // 숙소 저장만 실패해도 재시도에서 이미 생성한 코스를 다시 사용한다.
  const [savedCourse, setSavedCourse] = useState<SavedCourse>();
  const savedCourseRef = useRef<SavedCourse | undefined>(undefined);

  // 임시저장 날짜가 복원된 뒤 진입 옵션으로 모달을 연다. 취소하면 원래 일정은 유지한다.
  useEffect(() => {
    if (draftRestored && searchParams.get("mode") === "ai" && !isEditMode) {
      setAiInitialTripType(searchParams.get("trip") === "daytrip" ? "daytrip" : undefined);
      setAiModalOpen(true);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("mode");
      nextParams.delete("trip");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams, isEditMode, draftRestored]);

  // 드래그 앤 드롭으로 장소 순서/일차 변경
  const [dragSource, setDragSource] = useState<SpotPosition | null>(null);
  // spotIndex는 이동 전 목록의 삽입 경계(0부터 장소 수까지)를 가리킨다.
  const [dragTarget, setDragTarget] = useState<SpotPosition | null>(null);
  /** 손잡이를 누른 행만 draggable로 만들어, 메모 입력창에서 텍스트를 끌 때 드래그가 시작되지 않게 한다. */
  const [dragHandleActiveKey, setDragHandleActiveKey] = useState<string | null>(null);

  // 수정 모드일 때 기존 코스 데이터 조회 및 폼 채우기
  useEffect(() => {
    if (!isEditMode || !courseId) return;

    let ignore = false;
    setLoadingCourse(true);
    setAccommodationsLoaded(false);
    setErrorMessage(null);
    setNeedsReload(false);
    setCanEdit(false);
    setCanChangeVisibility(false);

    fetchCourse(courseId)
      .then(async (data) => {
        if (ignore) return;
        if (!data) throw new CourseAccessError("코스를 찾을 수 없습니다.");
        if (!(data.canEdit ?? data.isOwner === true)) throw new CourseAccessError("이 코스를 수정할 권한이 없습니다.");
        setCanEdit(true);
        setExpectedUpdatedAt(data.updatedAt);
        setTitle(data.title);
        setDescription(data.description || "");
        setThumbnail(data.thumbnail ?? null);
        setGeneratedBy(data.generatedBy ?? null);
        setThemes(data.themes ?? []);
        if (data.visibility) {
          setVisibility(data.visibility);
          setOriginalVisibility(data.visibility);
        }
        setCanChangeVisibility(data.isOwner === true);
        if (data.startDate) setStartDate(data.startDate);
        if (data.endDate) setEndDate(data.endDate);

        if (Array.isArray(data.days) && data.days.length > 0) {
          const loadedDays: DraftSpot[][] = data.days.map((day) =>
            day.spots.map((spot) => ({
              spotId: spot.spotId,
              title: spot.title,
              category: spot.category,
              region: spot.region,
              sigungu: spot.sigungu,
              thumbnail: spot.thumbnail,
              latitude: spot.latitude,
              longitude: spot.longitude,
              memo: spot.memo || "",
            }))
          );
          setDays(loadedDays);
          setDayThemes(collectDayThemes(data.days));
        }
        setLoadingCourse(false);
        const values = await fetchDayAccommodations(courseId);
        if (ignore) return;
        setDayAccommodations(Object.fromEntries(values.map((value) => [value.dayNumber, value])));
        setAccommodationsLoaded(true);
      })
      .catch((err) => {
        if (ignore) return;
        if (err instanceof UnauthorizedError) {
          alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
          navigate("/login");
          return;
        }
        if (!ignore) {
          setCanEdit(false);
          setNeedsReload(true);
          if (err instanceof CourseAccessError) {
            setTitle(""); setDescription(""); setDays([[]]); setDayAccommodations({});
            setThumbnail(null); setThemes([]); setDayThemes({});
            setStartDate(todayStr); setEndDate(defaultEndStr);
          }
          setErrorMessage(err instanceof Error ? err.message : "코스 정보를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoadingCourse(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isEditMode, courseId, navigate, loadAttempt]);

  // 초기에 sessionStorage에서 복원 (신규 작성 시에만)
  useEffect(() => {
    if (isEditMode) return;
    try {
      const saved = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as CourseDraft;
        if (parsed.savedCourse) {
          savedCourseRef.current = parsed.savedCourse;
          setSavedCourse(parsed.savedCourse);
          setExpectedUpdatedAt(parsed.savedCourse.updatedAt);
          setOriginalVisibility(parsed.savedCourse.visibility);
        }
        if (parsed.title !== undefined) setTitle(parsed.title);
        if (parsed.description !== undefined) setDescription(parsed.description);
        setGeneratedBy(parsed.generatedBy ?? null);
        setThemes(parsed.themes ?? []);
        if (parsed.visibility) setVisibility(parsed.visibility);
        if (parsed.startDate) setStartDate(parsed.startDate);
        if (parsed.endDate) setEndDate(parsed.endDate);
        if (Array.isArray(parsed.days) && parsed.days.length > 0) {
          setDays(parsed.days);
          setDayThemes(Object.fromEntries(Object.entries(parsed.dayThemes ?? {}).filter(
            ([dayNumber]) => Number(dayNumber) >= 1 && Number(dayNumber) <= parsed.days.length,
          )));
        }
        if (parsed.dayAccommodations) setDayAccommodations(parsed.dayAccommodations);
      }
    } catch {
      // sessionStorage 파싱 오류 무시
    } finally {
      setDraftRestored(true);
    }
  }, [isEditMode]);

  // 상태 변경 시 sessionStorage에 자동 저장 (신규 작성 시에만)
  useEffect(() => {
    if (isEditMode || !draftRestored) return;
    try {
      const draft: CourseDraft = {
        savedCourse: savedCourseRef.current ?? savedCourse,
        title,
        description,
        visibility,
        startDate,
        endDate,
        days,
        dayAccommodations,
        generatedBy,
        themes,
        dayThemes,
      };
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // sessionStorage 저장 오류 무시
    }
  }, [isEditMode, draftRestored, title, description, visibility, startDate, endDate, days, dayAccommodations, generatedBy, themes, dayThemes, savedCourse]);

  // 여행 기간(시작일~종료일) 한 번에 변경 - 캘린더 모달에서 적용 버튼을 누르면 호출됨
  const handleApplyDateRange = (newStart: string, newEnd: string) => {
    if (!syncDaysDuration(newStart, newEnd)) return;
    setStartDate(newStart);
    setEndDate(newEnd);
    setDateModalOpen(false);
  };

  const syncDaysDuration = (start: string, end: string) => {
    const targetCount = calculateDayCount(start, end);
    if (targetCount === days.length) return true;

    if (targetCount < days.length) {
      const removedDays = days.slice(targetCount);
      const hasSpotsInRemoved = removedDays.some((d) => d.length > 0);
      if (hasSpotsInRemoved) {
        const confirmed = window.confirm(
          "선택한 기간을 줄이면 삭제되는 일차의 장소 목록이 사라집니다. 계속하시겠습니까?"
        );
        if (!confirmed) {
          return false;
        }
      }
      setDays(days.slice(0, targetCount));
      setDayThemes((previous) => Object.fromEntries(Object.entries(previous).filter(
        ([dayNumber]) => Number(dayNumber) <= targetCount,
      )));
    } else {
      const additionalCount = targetCount - days.length;
      const newDays = [...days];
      for (let i = 0; i < additionalCount; i++) {
        newDays.push([]);
      }
      setDays(newDays);
    }
    return true;
  };

  // 장소 추가 모달 열기
  const handleOpenSearchModal = (dayIndex: number) => {
    setActiveDayIndex(dayIndex);
    setSearchModalOpen(true);
  };

  // 장소 추가 완료
  const handleSelectSpot = (spot: PopularSpot) => {
    if (activeDayIndex === null) return;
    const newDraftSpot: DraftSpot = {
      spotId: spot.spotId,
      title: spot.title,
      category: spot.category,
      region: spot.region,
      sigungu: spot.sigungu,
      thumbnail: spot.thumbnail,
      latitude: spot.latitude,
      longitude: spot.longitude,
      memo: "",
    };

    setDays((prev) => {
      const next = [...prev];
      next[activeDayIndex] = [...next[activeDayIndex], newDraftSpot];
      return next;
    });
  };

  // 장소 삭제
  const handleRemoveSpot = (dayIndex: number, spotIndex: number) => {
    setDays((prev) => {
      const next = [...prev];
      next[dayIndex] = next[dayIndex].filter((_, idx) => idx !== spotIndex);
      return next;
    });
  };

  /**
   * 드래그로 장소를 옮긴다. 같은 Day 안의 순서 변경과 다른 Day로의 이동을 함께 처리한다.
   * 같은 Day에서 아래로 옮길 때는 원래 장소를 제거하면서 당겨진 삽입 경계를 보정한다.
   */
  const moveSpot = (from: SpotPosition, to: SpotPosition) => {
    const insertionIndex = to.spotIndex - (
      from.dayIndex === to.dayIndex && from.spotIndex < to.spotIndex ? 1 : 0
    );
    if (from.dayIndex === to.dayIndex && from.spotIndex === insertionIndex) return;

    setDays((prev) => {
      const next = prev.map((daySpots) => [...daySpots]);
      const [moved] = next[from.dayIndex].splice(from.spotIndex, 1);
      if (!moved) return prev;

      // 다른 Day로 옮길 때만 중복을 막는다(같은 Day 안에서는 순서만 바뀌므로 중복이 아니다).
      if (from.dayIndex !== to.dayIndex && next[to.dayIndex].some((s) => s.spotId === moved.spotId)) {
        alert("해당 일차에 이미 같은 장소가 추가되어 있습니다.");
        return prev;
      }

      const insertAt = Math.min(Math.max(insertionIndex, 0), next[to.dayIndex].length);
      next[to.dayIndex].splice(insertAt, 0, moved);
      return next;
    });
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, position: SpotPosition) => {
    if (dragHandleActiveKey !== `${position.dayIndex}-${position.spotIndex}`) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", days[position.dayIndex][position.spotIndex].title);
    setDragSource(position);
    setDragTarget(null);
  };

  const getDropPosition = (event: DragEvent<HTMLDivElement>, dayIndex: number): SpotPosition => {
    const rows = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-course-spot-index]"));
    const nextRow = rows.find((row) => {
      const bounds = row.getBoundingClientRect();
      return event.clientY < bounds.top + bounds.height / 2;
    });
    return { dayIndex, spotIndex: nextRow ? Number(nextRow.dataset.courseSpotIndex) : rows.length };
  };

  const handleDragOverList = (event: DragEvent<HTMLDivElement>, dayIndex: number) => {
    if (!dragSource) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const position = getDropPosition(event, dayIndex);
    // 원래 자리의 앞뒤 경계는 순서가 바뀌지 않으므로 안내선을 표시하지 않는다.
    const isUnchanged = dragSource.dayIndex === dayIndex &&
      (position.spotIndex === dragSource.spotIndex || position.spotIndex === dragSource.spotIndex + 1);
    const target = isUnchanged ? null : position;
    setDragTarget((current) =>
      current?.dayIndex === target?.dayIndex && current?.spotIndex === target?.spotIndex ? current : target,
    );
  };

  const handleDropOn = (position: SpotPosition) => {
    if (dragSource) {
      moveSpot(dragSource, position);
    }
    handleDragEnd();
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDragTarget(null);
    setDragHandleActiveKey(null);
  };

  /**
   * AI가 만든 초안을 현재 화면에 채운다. 저장은 하지 않는다 —
   * 사용자가 드래그로 고치고 기존 저장 버튼으로 넘어가게 하기 위함이다.
   * 추천 이유는 메모 칸에 넣어 화면에 보이면서 그대로 수정·저장될 수 있게 한다.
   */
  const handleApplyAiDraft = (
    draft: AiCourseDraft,
    selectedThemes: AiCourseTheme[],
    dates: { startDate: string; endDate: string },
  ) => {
    const draftDays: DraftSpot[][] = draft.days.map((day) =>
      day.spots.map((spot) => ({
        spotId: spot.spotId,
        title: spot.title,
        category: spot.category,
        region: spot.region,
        sigungu: spot.sigungu,
        thumbnail: spot.thumbnail,
        latitude: spot.latitude,
        longitude: spot.longitude,
        memo: spot.reason ?? "",
      })),
    );

    if (draftDays.length > 0) {
      setDays(draftDays);
      setDayThemes(collectDayThemes(draft.days));
      setDayAccommodations((previous) => Object.fromEntries(Object.entries(previous).filter(
        ([dayNumber]) => Number(dayNumber) <= draftDays.length,
      )));
    }
    setStartDate(dates.startDate);
    setEndDate(dates.endDate);
    setGeneratedBy(draft.generatedBy === "LLM" || draft.generatedBy === "RULE_BASED" ? draft.generatedBy : null);
    setThemes([...selectedThemes]);
    if (!title.trim()) {
      setTitle(draft.title);
    }
    setAiModalOpen(false);
    setAiNotice(aiCourseNotice(draft));
  };

  // 메모 변경
  const handleMemoChange = (dayIndex: number, spotIndex: number, memo: string) => {
    setDays((prev) => {
      const next = [...prev];
      const daySpots = [...next[dayIndex]];
      daySpots[spotIndex] = { ...daySpots[spotIndex], memo };
      next[dayIndex] = daySpots;
      return next;
    });
  };

  // 유효성 검사
  const totalSpotCount = days.reduce((sum, d) => sum + d.length, 0);
  const isValid = title.trim().length > 0 && totalSpotCount > 0;

  // 저장 요청
  const handleSaveCourse = async () => {
    if (!isValid || submitting || !canEdit || needsReload || (isEditMode && !accommodationsLoaded)) return;

    setSubmitting(true);
    setErrorMessage(null);

    let courseSaved = false;
    try {
      const existingId = courseId ?? savedCourseRef.current?.courseId;
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        thumbnail: isEditMode ? thumbnail : null,
        visibility: existingId && visibility === originalVisibility ? undefined : visibility,
        expectedUpdatedAt,
        generatedBy,
        // 이전 서버가 메타데이터를 돌려주지 않은 수정 화면에서는 기존 테마를 지우지 않는다.
        themes: isEditMode && generatedBy === null && themes.length === 0 ? undefined : themes,
        startDate,
        endDate,
        days: days.map((daySpots, idx) => ({
          dayNumber: idx + 1,
          ...dayThemes[idx + 1],
          spots: daySpots.map((s) => ({
            spotId: s.spotId,
            memo: s.memo.trim() || null,
          })),
        })),
      };

      const result = existingId ? await updateCourse(existingId, payload) : await createCourse(payload);
      courseSaved = true;
      const saved = { courseId: result.courseId, updatedAt: result.updatedAt, visibility: result.visibility };
      savedCourseRef.current = saved;
      if (!isEditMode) {
        try {
          const draft = JSON.parse(sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? "{}");
          sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ ...draft, savedCourse: saved }));
        } catch {
          // 저장소가 제한돼도 현재 화면에서 같은 코스로 재시도할 수 있다.
        }
      }
      setExpectedUpdatedAt(result.updatedAt);
      setOriginalVisibility(result.visibility);
      await saveDayAccommodations(result.courseId, Object.values(dayAccommodations).filter((value) => value.name.trim()));
      if (!isEditMode) sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      navigate(`/courses/${result.courseId}`, { replace: true });
    } catch (err) {
      if (courseSaved) setSavedCourse(savedCourseRef.current);
      if (err instanceof UnauthorizedError) {
        alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
        navigate("/login");
        return;
      }
      if (err instanceof CourseConflictError || err instanceof CourseAccessError) {
        setNeedsReload(true);
        setCanEdit(false);
        if (err instanceof CourseAccessError) {
          setTitle(""); setDescription(""); setDays([[]]); setDayAccommodations({});
          setThumbnail(null); setThemes([]); setDayThemes({});
          setStartDate(todayStr); setEndDate(defaultEndStr);
        }
      }
      setErrorMessage(
        courseSaved ? "코스는 저장됐지만 숙소를 저장하지 못했습니다. 다시 저장하면 같은 코스에 반영됩니다."
        : err instanceof Error
          ? err.message
          : isEditMode
            ? "코스 수정에 실패했습니다."
            : "코스 저장에 실패했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="app-page min-h-screen bg-muted/20 pb-20">
      <AppNav />

      {loadingCourse ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">코스 정보를 불러오는 중입니다...</p>
        </div>
      ) : (
        <main className="app-page-content mx-auto max-w-4xl px-4 sm:px-6">
        {/* 상단 브레드크럼 */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>여행</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-medium text-foreground">
            {isEditMode ? "코스 수정" : "직접 코스 생성"}
          </span>
        </div>

        {/* 헤더 및 저장 버튼 */}
        <div className="mt-4 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {isEditMode ? "여행 코스 수정하기" : "나만의 여행 코스 만들기"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isEditMode
                ? "일정과 장소를 수정하여 나만의 여행 코스를 업데이트하세요."
                : "여행 일정과 방문할 명소들을 Day별로 자유롭게 계획해보세요."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            {/* 빈 화면에서 장소를 하나씩 담는 게 부담스러운 사용자를 위한 진입점 */}
            {!isEditMode && (
              <button
                type="button"
                onClick={() => {
                  setAiInitialTripType(undefined);
                  setAiModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                AI에게 맡기기
              </button>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={!isValid || submitting || !canEdit || needsReload || (isEditMode && !accommodationsLoaded)}
                onClick={handleSaveCourse}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? isEditMode
                    ? "수정 중..."
                    : "저장 중..."
                  : isEditMode
                    ? "수정 완료"
                    : "코스 저장하기"}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                취소
              </button>
            </div>
          </div>
        </div>

        {/* AI 초안 안내 */}
        {aiNotice && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="flex-1 text-xs text-foreground">{aiNotice}</p>
            <button
              type="button"
              onClick={() => setAiNotice(null)}
              aria-label="안내 닫기"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* 에러 메시지 */}
        {errorMessage && (
          <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
            <p>{errorMessage}</p>
            {needsReload && <button type="button" className="mt-2 underline" onClick={() => {
              if (courseId) setLoadAttempt((value) => value + 1);
              else if (savedCourseRef.current) navigate(`/courses/${savedCourseRef.current.courseId}/edit`, { replace: true });
            }}>최신 코스 불러오기</button>}
          </div>
        )}

        {/* 유효성 안내 */}
        {!isValid && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card/60 p-3.5 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {title.trim().length === 0
                ? "코스 제목을 입력해주세요."
                : "최소 1개 이상의 장소를 일정에 추가해야 저장할 수 있습니다."}
            </span>
          </div>
        )}

        {/* 기본 정보 설정 카드 */}
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-foreground">여행 기본 정보</h2>
          <CourseMetadata generatedBy={generatedBy} themes={themes} className="mt-3" />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="course-title" className="block text-xs font-semibold text-muted-foreground">
                코스 제목 <span className="text-destructive">*</span>
              </label>
              <input
                id="course-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2박 3일 강릉 힐링 힐링 바다 여행"
                className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                maxLength={100}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="course-desc" className="block text-xs font-semibold text-muted-foreground">
                코스 소개 (선택)
              </label>
              <textarea
                id="course-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="어떤 테마의 여행인지 간단히 메모해보세요."
                rows={2}
                className="mt-1.5 w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                maxLength={500}
              />
            </div>

            {/* 일정 선택 - 시작일/종료일을 캘린더 하나에서 함께 고른다 */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground">
                여행 기간 ({formatCourseDuration(days.length)})
              </label>
              <button
                type="button"
                onClick={() => setDateModalOpen(true)}
                className="mt-1.5 flex w-full items-center gap-2 rounded-xl border border-input bg-background px-3.5 py-2.5 text-left text-sm text-foreground shadow-sm transition-colors hover:bg-muted/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>
                  {formatDisplayDate(startDate)} ~ {formatDisplayDate(endDate)}
                </span>
              </button>
            </div>

            {/* 공개 범위 설정 */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-muted-foreground">
                공개 범위 설정
              </label>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="visibility-public-button"
                  disabled={!canChangeVisibility}
                  onClick={() => setVisibility("PUBLIC")}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    visibility === "PUBLIC"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-background hover:bg-muted/40"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      visibility === "PUBLIC"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Globe className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">전체 공개</span>
                      {visibility === "PUBLIC" && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          선택됨
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      다른 여행자들도 내 여행 코스를 함께 볼 수 있어요.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="visibility-private-button"
                  disabled={!canChangeVisibility}
                  onClick={() => setVisibility("PRIVATE")}
                  className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                    visibility === "PRIVATE"
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-background hover:bg-muted/40"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      visibility === "PRIVATE"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Lock className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">나만 보기 (비공개)</span>
                      {visibility === "PRIVATE" && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          선택됨
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      작성자만 볼 수 있어요. 친구 초대와 여행 이야기 연결은 사용할 수 없어요.
                    </p>
                  </div>
                </button>
              </div>
              {!canChangeVisibility && (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">공개 범위는 코스 작성자만 변경할 수 있어요.</p>
              )}
              {isEditMode && originalVisibility === "PUBLIC" && visibility === "PRIVATE" && (
                <p className="mt-3 rounded-xl bg-muted/50 p-3 text-xs leading-5 text-muted-foreground" role="status">
                  나만 보기로 저장하면 기존 멤버의 접근 권한과 초대 링크가 해제되고, 다른 사람의 위시리스트에서 이 코스가 제거돼요. 연결된 여행 이야기의 코스 연결도 해제돼요.
                </p>
              )}
            </div>
          </div>
        </div>

        <AiCourseModal
          open={aiModalOpen}
          initialTripType={aiInitialTripType}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setAiModalOpen(false)}
          onApply={handleApplyAiDraft}
        />

        <DateRangeModal
          open={dateModalOpen}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setDateModalOpen(false)}
          onApply={handleApplyDateRange}
        />

        {/* Day별 일정 섹션 */}
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">
              상세 일정 ({formatCourseDuration(days.length)})
            </h2>
            <span className="text-xs text-muted-foreground">
              총 <span className="font-semibold text-primary">{totalSpotCount}</span>개 장소 선택됨
            </span>
          </div>

          {days.map((daySpots, dayIndex) => {
            const dayNumber = dayIndex + 1;
            const assignedThemes = dayThemes[dayNumber];
            const endAccommodation = dayAccommodations[dayNumber];
            const showAccommodationControls = canEdit && (!isEditMode || accommodationsLoaded) && (startDate !== endDate || Boolean(endAccommodation));
            const showAccommodationHint = showAccommodationControls && isEditMode && accommodationsLoaded
              && accommodationHintVisible && dayIndex === accommodationHintDayIndex;
            const startAccommodation = dayIndex === 0 ? endAccommodation : dayAccommodations[dayNumber - 1];
            const hasStartAccommodationLocation = startAccommodation?.latitude != null
              && startAccommodation.longitude != null;
            const hasEndAccommodationLocation = endAccommodation?.latitude != null
              && endAccommodation.longitude != null;
            const sameAccommodation = hasStartAccommodationLocation
              && hasEndAccommodationLocation
              && startAccommodation.latitude === endAccommodation.latitude
              && startAccommodation.longitude === endAccommodation.longitude;
            return (
              <div
                key={`day-${dayNumber}`}
                data-testid={`day-card-${dayNumber}`}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all"
              >
                {/* Day 헤더 */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-3.5 sm:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary font-bold text-xs text-primary-foreground shadow-sm">
                      D{dayNumber}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-foreground sm:text-base">
                        Day {dayNumber}
                      </h3>
                      {(assignedThemes?.themes?.length || assignedThemes?.tripIdeas?.length) ? (
                        <p className="mt-1 flex items-start gap-1 text-xs font-medium text-primary" data-testid={`day-theme-${dayNumber}`}>
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{describeDayThemes(assignedThemes)}</span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 gap-2">
                    {showAccommodationControls && (
                      <button
                        ref={dayIndex === accommodationHintDayIndex ? accommodationHintButtonRef : undefined}
                        type="button"
                        aria-describedby={showAccommodationHint ? "accommodation-hint-description" : undefined}
                        onClick={() => {
                          setAccommodationHintVisible(false);
                          setAccommodationDayNumber(dayNumber);
                        }}
                        className={`flex items-center gap-1.5 rounded-lg border border-primary/20 bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${showAccommodationHint ? "ring-2 ring-primary/25 ring-offset-2 ring-offset-background" : ""}`}
                      >
                        <span>🏠</span>
                        {endAccommodation ? "숙소 변경" : "숙소 추가"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenSearchModal(dayIndex)}
                      className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      장소 추가
                    </button>
                  </div>
                  {showAccommodationHint && (
                    <div className="w-full">
                      <aside
                        aria-labelledby="accommodation-hint-title"
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.stopPropagation();
                            dismissAccommodationHint();
                          }
                        }}
                        className="relative ml-auto max-w-sm rounded-xl border border-primary/20 bg-background p-4 shadow-sm"
                      >
                        <span aria-hidden="true" className="absolute -top-1.5 right-36 h-2.5 w-2.5 rotate-45 border-l border-t border-primary/20 bg-background" />
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p id="accommodation-hint-title" className="text-sm font-semibold text-foreground">숙소도 일정에 추가해 보세요</p>
                            <p id="accommodation-hint-description" className="mt-1.5 text-xs leading-relaxed text-muted-foreground">머무를 숙소를 등록하면 지도에서 여행 동선을 함께 확인할 수 있어요.</p>
                          </div>
                          <button
                            type="button"
                            aria-label="숙소 안내 닫기"
                            onClick={() => dismissAccommodationHint()}
                            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => dismissAccommodationHint(true)}
                          className="mt-2 min-h-8 rounded text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          다시 보지 않기
                        </button>
                      </aside>
                    </div>
                  )}
                </div>

                {endAccommodation && (
                  <div className="flex items-center justify-between border-b border-primary/10 bg-primary/[0.035] px-5 py-3 sm:px-6">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-primary">🏠 Day {dayNumber} 도착 숙소</p>
                      <p className="truncate text-sm font-semibold">{endAccommodation.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{endAccommodation.address}</p>
                      {dayIndex > 0 && startAccommodation && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {startAccommodation.name}에서 출발
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Day ${dayNumber} 숙소 삭제`}
                      onClick={() => setDayAccommodations((previous) => {
                        const next = { ...previous };
                        delete next[dayNumber];
                        return next;
                      })}
                      className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Day 장소 목록 */}
                <div className="p-4 sm:p-6">
                  <div
                    className="-my-1.5 py-1.5"
                    onDragEnter={(event) => handleDragOverList(event, dayIndex)}
                    onDragOver={(event) => handleDragOverList(event, dayIndex)}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setDragTarget((current) => current?.dayIndex === dayIndex ? null : current);
                      }
                    }}
                    onDrop={(event) => {
                      if (!dragSource) return;
                      event.preventDefault();
                      handleDropOn(getDropPosition(event, dayIndex));
                    }}
                  >
                    {daySpots.length === 0 ? (
                      <div
                        className={`relative flex flex-col items-center justify-center rounded-xl border border-dashed py-8 text-center text-muted-foreground transition-colors ${
                          dragSource !== null && dragTarget?.dayIndex === dayIndex
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        }`}
                      >
                        {dragTarget?.dayIndex === dayIndex && <SpotDropIndicator />}
                        <Calendar className="h-7 w-7 text-muted-foreground/40" />
                        <p className="mt-2 text-xs font-medium">
                          Day {dayNumber}에 담긴 장소가 없습니다.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleOpenSearchModal(dayIndex)}
                          className="mt-2.5 text-xs font-semibold text-primary hover:underline"
                        >
                          + 명소 및 맛집 검색하여 추가하기
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {daySpots.map((spot, spotIndex) => {
                          const rowKey = `${dayIndex}-${spotIndex}`;
                          const isDragging =
                            dragSource?.dayIndex === dayIndex && dragSource?.spotIndex === spotIndex;
                          const isTargetDay = dragTarget?.dayIndex === dayIndex;

                          return (
                            <div
                              key={`${spot.spotId}-${spotIndex}`}
                              data-course-spot-index={spotIndex}
                              draggable={dragHandleActiveKey === rowKey}
                              onDragStart={(event) => handleDragStart(event, { dayIndex, spotIndex })}
                              onDragEnd={handleDragEnd}
                              className={`relative flex flex-col gap-3 rounded-xl border border-border bg-background p-3.5 shadow-sm transition-opacity sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${
                                isDragging ? "opacity-40" : ""
                              }`}
                            >
                              {isTargetDay && dragTarget.spotIndex === spotIndex && <SpotDropIndicator />}
                              {isTargetDay && dragTarget.spotIndex === daySpots.length && spotIndex === daySpots.length - 1 && (
                                <SpotDropIndicator edge="bottom" />
                              )}
                              {/* 번호 및 썸네일 */}
                              <div className="flex items-center gap-3">
                                {/* 드래그 손잡이 */}
                                <button
                                  type="button"
                                  aria-label={`${spot.title} 순서 변경 손잡이 (끌어서 이동)`}
                                  title="끌어서 순서를 바꾸거나 다른 Day로 옮길 수 있어요"
                                  onMouseDown={() => setDragHandleActiveKey(rowKey)}
                                  onMouseUp={() => setDragHandleActiveKey(null)}
                                  className="flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                >
                                  <GripVertical className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                                  {spotIndex + 1}
                                </span>
                                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                                  <SpotImage
                                    src={spot.thumbnail}
                                    alt={spot.title}
                                    className="h-full w-full object-cover"
                                  />
                                </div>
                              </div>

                              {/* 장소 정보 및 메모 */}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-bold text-foreground">
                                    {spot.title}
                                  </span>
                                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {spot.category}
                                  </span>
                                </div>
                                <input
                                  type="text"
                                  value={spot.memo}
                                  onChange={(e) =>
                                    handleMemoChange(dayIndex, spotIndex, e.target.value)
                                  }
                                  placeholder="메모 입력 (예: 점심 식사, 입장료 5000원)"
                                  className="mt-1.5 w-full rounded-lg border border-input bg-card/40 px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
                                  maxLength={200}
                                />
                              </div>

                              {/* 액션 컨트롤 */}
                              <div className="flex items-center justify-end gap-1 border-t border-border/50 pt-2 sm:border-0 sm:pt-0">
                                <div className="flex items-center gap-1">
                                  {/* 삭제 */}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSpot(dayIndex, spotIndex)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                    aria-label="장소 삭제"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 담은 장소들이 얼마나 흩어져 있는지 지도로 확인한다 */}
                  {daySpots.length > 0 && (
                    <KakaoMap
                      className="mt-4"
                      spots={[
                        ...(hasStartAccommodationLocation ? [{
                          spotId: -dayNumber * 2,
                          title: `출발 숙소 · ${startAccommodation.name}`,
                          latitude: startAccommodation.latitude,
                          longitude: startAccommodation.longitude,
                          markerNumber: 1,
                        }] : []),
                        ...daySpots.map((spot, spotIndex) => ({
                          spotId: spot.spotId,
                          title: spot.title,
                          latitude: spot.latitude,
                          longitude: spot.longitude,
                          markerNumber: spotIndex + (hasStartAccommodationLocation ? 2 : 1),
                        })),
                        ...(!sameAccommodation && hasEndAccommodationLocation ? [{
                          spotId: -dayNumber * 2 - 1,
                          title: `도착 숙소 · ${endAccommodation.name}`,
                          latitude: endAccommodation.latitude,
                          longitude: endAccommodation.longitude,
                          markerNumber: daySpots.length + (hasStartAccommodationLocation ? 2 : 1),
                        }] : []),
                      ]}
                      returnToStart={sameAccommodation}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
      )}

      {/* 장소 검색 모달 */}
      {activeDayIndex !== null && (
        <SpotSearchModal
          open={searchModalOpen}
          onClose={() => {
            setSearchModalOpen(false);
            setActiveDayIndex(null);
          }}
          onSelect={handleSelectSpot}
          excludedSpotIds={days[activeDayIndex]?.map((s) => s.spotId) || []}
          dayNumber={activeDayIndex + 1}
          regions={inferCourseSearchRegions(days, activeDayIndex)}
        />
      )}
      {accommodationDayNumber !== null && (
        <AccommodationSearchModal
          open
          dayNumber={accommodationDayNumber}
          saved={Object.values(dayAccommodations)}
          onClose={() => setAccommodationDayNumber(null)}
          onSelect={(value) => setDayAccommodations((previous) => ({
            ...previous,
            [value.dayNumber]: value,
          }))}
        />
      )}
    </div>
  );
}
