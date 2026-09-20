import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Heart,
  Images,
  Info,
  MapPin,
  ParkingCircle,
  Phone,
  ReceiptText,
  Utensils,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

import { LoaderFour } from "@/components/ui/unique-loader-components";
import AppNav from "@/components/ui/app-nav";
import SpotImage from "@/components/ui/spot-image";
import GooglePlacePhotoCard from "@/components/ui/google-place-photo-card";
import { getVerifiedSpotImageCredit } from "@/lib/verified-spot-images";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";
import {
  hasSpotCoordinates,
  MISSING_SPOT_ADDRESS,
  MISSING_SPOT_DESCRIPTION,
  MISSING_SPOT_LOCATION,
  MISSING_SPOT_USAGE,
} from "@/lib/spot-display";
import {
  fetchSpotDetail,
  likeSpot,
  unlikeSpot,
  UnauthorizedError,
  type SpotDetail,
  type SpotTourInfo,
} from "@/services/spots";

const TOUR_INFO_FIELDS: { label: string; key: keyof SpotTourInfo; icon: LucideIcon }[] = [
  { label: "이용시간", key: "timeInfo", icon: Clock3 },
  { label: "쉬는날", key: "restInfo", icon: CalendarDays },
  { label: "전화", key: "tel", icon: Phone },
  { label: "주차", key: "parkInfo", icon: ParkingCircle },
  { label: "대표메뉴", key: "firstMenu", icon: UtensilsCrossed },
  { label: "취급메뉴", key: "treatMenu", icon: Utensils },
  { label: "인허가번호", key: "lcnsno", icon: ReceiptText },
  { label: "추가 안내", key: "additionalInfo", icon: Info },
];

// 관광 API의 HTML은 실행하지 않고, 줄바꿈과 엔티티만 읽기 쉬운 텍스트로 변환한다.
function formatTourText(value: string | null | undefined): string {
  if (!value) return "";
  // Detached template contents stay inert, including remote images. Return text
  // only; none of the API's elements are ever inserted into the live page.
  const template = document.createElement("template");
  template.innerHTML = value;
  template.content.querySelectorAll("script, style, noscript, iframe, object, embed, template")
    .forEach((element) => element.remove());
  template.content.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
  template.content.querySelectorAll("p, div, li, tr, blockquote, pre")
    .forEach((element) => {
      element.prepend("\n");
      element.append("\n");
    });
  return (template.content.textContent ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function SpotDetailPage() {
  const { spotId } = useParams<{ spotId: string }>();
  const navigate = useNavigate();
  // undefined = 로딩 중, null = 없음(404) 또는 에러
  const [spot, setSpot] = useState<SpotDetail | null | undefined>(undefined);
  const [selectedImage, setSelectedImage] = useState(0);
  const [displayedImage, setDisplayedImage] = useState<{ key: string; source: string } | null>(null);

  // 이 API는 호출할 때마다 조회수를 늘린다. React.StrictMode는 개발 모드에서 effect를
  // 마운트→클린업→재마운트로 일부러 두 번 실행하는데, 이때 매번 fetch를 새로 호출하면
  // 같은 화면 진입에 조회수가 2씩 올라간다. 같은 spotId로 이미 나가 있는 요청이 있으면
  // 새로 호출하지 않고 그 결과를 재사용해서, 실제 네트워크 호출이 spotId당 한 번만 나가게 한다.
  const inFlightRequest = useRef<{ spotId: string; promise: Promise<SpotDetail | null> } | null>(null);

  useEffect(() => {
    const currentSpotId = spotId ?? "";
    let cancelled = false;
    setSpot(undefined);
    setSelectedImage(0);

    let request = inFlightRequest.current;
    if (!request || request.spotId !== currentSpotId) {
      request = { spotId: currentSpotId, promise: fetchSpotDetail(currentSpotId) };
      inFlightRequest.current = request;
    }
    const { promise } = request;

    promise
      .then((result) => {
        if (!cancelled) {
          setSpot(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSpot(null);
        }
      })
      .finally(() => {
        if (inFlightRequest.current === request) {
          inFlightRequest.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [spotId]);

  const [isTogglingLike, setIsTogglingLike] = useState(false);
  const galleryImages = useMemo(
    () => spot ? Array.from(new Set([spot.thumbnail, ...(spot.images ?? [])]
      .map((image) => image?.trim()).filter((image): image is string => Boolean(image)))) : [],
    [spot?.thumbnail, spot?.images],
  );
  const address = useMemo(() => formatTourText(spot?.address), [spot?.address]);
  const description = useMemo(() => formatTourText(spot?.description), [spot?.description]);
  const infoFields = useMemo(
    () => TOUR_INFO_FIELDS.map((field) => ({ ...field, value: formatTourText(spot?.info?.[field.key]) }))
      .filter(({ value }) => value),
    [spot?.info],
  );
  const activeImage = galleryImages[selectedImage];
  const similarImage = spot ? getSimilarSpotImage(spot) : undefined;
  const imageKey = JSON.stringify([spot?.spotId, activeImage, similarImage?.url]);
  const displayedSource = displayedImage?.key === imageKey
    ? displayedImage.source
    : activeImage ?? similarImage?.url;
  const activeImageCredit = getVerifiedSpotImageCredit(displayedSource);
  const isSimilarImage = !!similarImage && displayedSource === similarImage.url;
  const handleImageSourceChange = useCallback((source: string) => {
    setDisplayedImage({ key: imageKey, source });
  }, [imageKey]);

  const goBack = () => navigate(-1);

  const toggleLike = async () => {
    if (!spot || isTogglingLike) {
      return;
    }

    const previousSpot = spot;
    const nextLiked = !spot.isLiked;
    const nextLikeCount = nextLiked
      ? spot.likeCount + 1
      : Math.max(0, spot.likeCount - 1);

    // 즉시 UI 반영 (Optimistic Update)
    setSpot({ ...spot, isLiked: nextLiked, likeCount: nextLikeCount });
    setIsTogglingLike(true);

    try {
      const result = previousSpot.isLiked
        ? await unlikeSpot(previousSpot.spotId)
        : await likeSpot(previousSpot.spotId);
      setSpot({ ...previousSpot, isLiked: result.liked, likeCount: result.likeCount });
    } catch (error) {
      setSpot(previousSpot);
      if (error instanceof UnauthorizedError) {
        alert("로그인이 필요합니다. 로그인 페이지로 이동합니다.");
        navigate("/login");
      }
    } finally {
      setIsTogglingLike(false);
    }
  };

  return (
    <div className="app-page min-h-screen bg-background pb-28 text-foreground md:pb-16">
      <AppNav />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[30rem] bg-gradient-to-b from-primary/[0.08] to-transparent" aria-hidden="true" />

      <header className="relative mx-auto flex max-w-6xl items-center gap-3 px-5 py-5 sm:px-8 md:py-7 lg:px-10">
        <button
          type="button"
          onClick={goBack}
          className={`flex h-11 w-11 items-center justify-center rounded-full border border-primary/10 bg-background transition-colors hover:bg-primary/10 hover:text-primary ${FOCUS_RING}`}
          aria-label="뒤로 가기"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link to="/spots/popular" className={`rounded-md text-sm text-muted-foreground transition-colors hover:text-primary ${FOCUS_RING}`}>
          인기 장소
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" aria-hidden="true" />
        <span className="text-sm font-medium">장소 상세</span>
      </header>

      {spot === undefined ? (
        <div className="relative flex justify-center py-24">
          <LoaderFour text="장소 정보를 불러오는 중..." />
        </div>
      ) : spot === null ? (
        <div className="relative mx-5 flex flex-col items-center gap-4 rounded-3xl border border-primary/10 bg-background px-5 py-24 text-center sm:mx-auto sm:max-w-xl">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MapPin className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="text-base text-muted-foreground">존재하지 않는 장소예요.</p>
          <button
            type="button"
            onClick={goBack}
            className={`rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${FOCUS_RING}`}
          >
            돌아가기
          </button>
        </div>
      ) : (
        <main className="app-page-content relative mx-auto max-w-6xl px-5 pb-8 sm:px-8 lg:px-10">
          <div className="mb-7 flex flex-col items-start justify-between gap-5 sm:mb-8 sm:flex-row sm:items-center sm:gap-8">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/10 bg-primary/[0.08] px-3 py-1.5 text-xs font-semibold text-primary">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {spot.category}
              </span>
              <h1 className="mt-3 break-words text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{spot.title}</h1>
              <p className="mt-3 flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 whitespace-pre-line break-words">{address || MISSING_SPOT_ADDRESS}</span>
              </p>
              {!hasSpotCoordinates(spot) && (
                <p className="mt-2 text-sm text-muted-foreground">{MISSING_SPOT_LOCATION}</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground sm:text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Heart className="h-4 w-4 text-primary/70" aria-hidden="true" />
                  좋아요 {spot.likeCount}
                </span>
                <span className="h-3 w-px bg-border" aria-hidden="true" />
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  조회수 {spot.viewCount}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleLike}
              disabled={isTogglingLike}
              className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING} ${
                spot.isLiked
                  ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                  : "border-primary/20 bg-background text-primary shadow-sm hover:bg-primary/5"
              }`}
              aria-pressed={spot.isLiked}
              aria-label={spot.isLiked ? `${spot.title} 좋아요 취소` : `${spot.title} 좋아요`}
            >
              <Heart
                className={`h-4 w-4 ${spot.isLiked ? "fill-current" : ""}`}
                strokeWidth={2}
                aria-hidden="true"
              />
              {spot.isLiked ? "위시리스트에 담았어요" : "위시리스트에 담기"}
            </button>
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-7">
            <div className="min-w-0 space-y-6">
              <section aria-label="장소 사진" className="overflow-hidden rounded-3xl border border-primary/10 bg-white p-2 shadow-sm dark:bg-background sm:p-3">
                <GooglePlacePhotoCard spot={spot}>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-muted sm:aspect-[16/10]">
                    <SpotImage
                      className="h-full w-full object-cover"
                      src={activeImage}
                      alt={spot.title}
                      similarImage={similarImage}
                      onSourceChange={handleImageSourceChange}
                    />
                    {galleryImages.length > 1 ? (
                      <>
                        <button type="button" aria-label="이전 사진" onClick={() => setSelectedImage((index) => (index - 1 + galleryImages.length) % galleryImages.length)} className={`absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-sm transition-colors hover:bg-white ${FOCUS_RING}`}>
                          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <button type="button" aria-label="다음 사진" onClick={() => setSelectedImage((index) => (index + 1) % galleryImages.length)} className={`absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-sm transition-colors hover:bg-white ${FOCUS_RING}`}>
                          <ChevronRight className="h-5 w-5" aria-hidden="true" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  {isSimilarImage ? (
                    <p className="px-2 pb-1 pt-3 text-xs leading-5 text-muted-foreground sm:px-3">
                      ‘유사 이미지’는 실제 장소 사진이 아닙니다.{" "}
                      <Link to="/image-credits#similar-images" className={`rounded underline underline-offset-4 hover:text-primary ${FOCUS_RING}`}>
                        유사 이미지 출처
                      </Link>
                    </p>
                  ) : null}
                </GooglePlacePhotoCard>
                {galleryImages.length > 1 ? (
                  <div className="flex items-center justify-end gap-1.5 px-2 pt-3 text-xs font-medium text-muted-foreground sm:px-3" role="status" aria-label="현재 사진">
                    <Images className="h-3.5 w-3.5" aria-hidden="true" />
                    {selectedImage + 1} / {galleryImages.length}
                  </div>
                ) : null}
                {galleryImages.length > 1 ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto p-1 sm:mt-3 sm:gap-3" aria-label="사진 선택">
                    {galleryImages.map((image, index) => (
                      <button
                        key={image}
                        type="button"
                        aria-label={`${spot.title} 사진 ${index + 1} 보기`}
                        aria-pressed={activeImage === image}
                        onClick={() => setSelectedImage(index)}
                        className={`group h-20 w-28 shrink-0 overflow-hidden rounded-xl border-2 transition-colors sm:h-24 sm:w-32 ${FOCUS_RING} ${activeImage === image ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}
                      >
                        <SpotImage
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
                          src={image}
                          alt={`${spot.title} 사진 ${index + 1}`}
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
                {activeImageCredit ? (
                  <p className="px-2 pb-1 pt-3 text-xs leading-5 text-muted-foreground sm:px-3">
                    사진: {activeImageCredit.author} · {activeImageCredit.license}{" "}
                    <Link
                      to={`/image-credits#${activeImageCredit.id}`}
                      className={`ml-1 rounded underline underline-offset-4 hover:text-primary ${FOCUS_RING}`}
                    >
                      사진 출처
                    </Link>
                  </p>
                ) : null}
              </section>

              <section aria-labelledby="spot-description-heading" className="rounded-3xl border border-primary/10 bg-white p-6 shadow-sm dark:bg-background sm:p-7">
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/[0.08] text-primary">
                    <MapPin className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 id="spot-description-heading" className="text-lg font-bold tracking-tight">이런 곳이에요</h2>
                </div>
                <p className="whitespace-pre-line break-words text-sm leading-7 text-foreground/80">{description || MISSING_SPOT_DESCRIPTION}</p>
              </section>
            </div>

            <section aria-labelledby="spot-info-heading" className="min-w-0 overflow-hidden rounded-3xl border border-primary/10 bg-white shadow-sm dark:bg-background lg:sticky lg:top-24">
              <div className="border-b border-primary/[0.08] bg-primary/[0.04] px-6 py-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Info className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <h2 id="spot-info-heading" className="text-lg font-bold tracking-tight">이용 안내</h2>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">방문 전에 필요한 정보를 확인해 보세요.</p>
              </div>
              {infoFields.length > 0 ? (
                <dl className="divide-y divide-border/50 px-6">
                  {infoFields.map(({ label, key, icon: Icon, value }) => (
                    <div key={key} className="grid grid-cols-[1.125rem_minmax(0,1fr)] gap-x-3 py-4">
                      <Icon className="mt-0.5 h-4 w-4 text-primary/70" aria-hidden="true" />
                      <dt className="text-xs font-medium leading-5 text-muted-foreground">{label}</dt>
                      <dd className={`col-start-2 mt-1 whitespace-pre-line break-words text-sm leading-6 ${key === "firstMenu" ? "font-semibold text-primary" : "text-foreground"}`}>
                        {key === "tel" && /^[+\d\s()-]+$/.test(value) ? (
                          <a href={`tel:${value.replace(/[^+\d]/g, "")}`} className={`rounded-sm underline-offset-4 hover:text-primary hover:underline ${FOCUS_RING}`}>{value}</a>
                        ) : value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="px-6 py-5 text-sm leading-6 text-muted-foreground">{MISSING_SPOT_USAGE}</p>
              )}
            </section>
          </div>
        </main>
      )}
    </div>
  );
}
