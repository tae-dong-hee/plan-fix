import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Images } from "lucide-react";

import SpotImage from "@/components/ui/spot-image";
import { getVerifiedSpotImageCredit } from "@/lib/verified-spot-images";
import { cn } from "@/lib/utils";

export type SpotGalleryPhoto = {
  url: string;
  thumbnailUrl?: string;
  google?: {
    authors: Array<{ displayName: string; uri?: string }>;
    mapsUrl?: string;
    flagUrl?: string;
  };
};

type SpotPhotoGalleryProps = {
  title: string;
  photos: SpotGalleryPhoto[];
  similarImage?: ComponentProps<typeof SpotImage>["similarImage"];
  onUnavailable?: () => void;
};

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const CREDIT_LINK = `rounded underline underline-offset-4 hover:text-primary ${FOCUS_RING}`;
const GOOGLE_MAPS_LABEL = "whitespace-nowrap font-normal not-italic text-xs tracking-normal text-[#5E5E5E] dark:text-white [font-family:Roboto,Arial,sans-serif]";

function GooglePhotoAuthors({ authors }: { authors: NonNullable<SpotGalleryPhoto["google"]>["authors"] }) {
  if (authors.length === 0) return null;
  return (
    <span>
      사진: {authors.map((author, index) => (
        <span key={`${author.uri ?? author.displayName}:${index}`}>
          {index > 0 ? ", " : null}
          {author.uri ? (
            <a href={author.uri} target="_blank" rel="noopener noreferrer" className={CREDIT_LINK}>{author.displayName}</a>
          ) : author.displayName}
        </span>
      ))}
    </span>
  );
}

export function GooglePhotoAttribution({ google, className, compact = false }: {
  google: NonNullable<SpotGalleryPhoto["google"]>;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground", compact ? "text-[10px] leading-4" : "text-xs leading-5", className)}>
      {google.mapsUrl ? (
        <a href={google.mapsUrl} target="_blank" rel="noopener noreferrer" translate="no" className={cn(CREDIT_LINK, GOOGLE_MAPS_LABEL)}>Google Maps</a>
      ) : <span translate="no" className={GOOGLE_MAPS_LABEL}>Google Maps</span>}
      <GooglePhotoAuthors authors={google.authors} />
      {google.flagUrl ? (
        <a href={google.flagUrl} target="_blank" rel="noopener noreferrer" className={CREDIT_LINK}>{compact ? "신고" : "사진 신고"}</a>
      ) : null}
      {!compact ? <Link to="/image-credits#google-maps" className={CREDIT_LINK}>출처 및 이용 안내</Link> : null}
    </div>
  );
}

function GalleryThumbnail({ photo, title, index, selected, onSelect, onSourceChange }: {
  photo: SpotGalleryPhoto;
  title: string;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onSourceChange: (photo: SpotGalleryPhoto, source: string) => void;
}) {
  const source = photo.thumbnailUrl ?? photo.url;
  const [displayedSource, setDisplayedSource] = useState(source);
  const handleSourceChange = useCallback((nextSource: string) => {
    setDisplayedSource(nextSource);
    onSourceChange(photo, nextSource);
  }, [photo, onSourceChange]);
  return (
    <div className="w-28 shrink-0 sm:w-32">
      <button
        type="button"
        aria-label={`${title} 사진 ${index + 1} 보기`}
        aria-pressed={selected}
        onClick={onSelect}
        className={`group h-20 w-full overflow-hidden rounded-xl border-2 transition-colors sm:h-24 ${FOCUS_RING} ${selected ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"}`}
      >
        <SpotImage
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
          src={source}
          alt={`${title} 사진 ${index + 1}`}
          loading="lazy"
          onSourceChange={handleSourceChange}
        />
      </button>
      {photo.google && displayedSource === source ? (
        <p className="mt-1 break-words px-0.5 text-[10px] leading-4 text-muted-foreground">
          <GooglePhotoAuthors authors={photo.google.authors} />
        </p>
      ) : null}
    </div>
  );
}

/** 같은 사진 목록은 선택을 유지하고, 장소나 사진 목록이 바뀌면 첫 사진부터 보여준다. */
export default function SpotPhotoGallery(props: SpotPhotoGalleryProps) {
  return <SpotPhotoGalleryContent key={JSON.stringify([props.title, props.photos, props.similarImage?.url])} {...props} />;
}

function SpotPhotoGalleryContent({ title, photos, similarImage, onUnavailable }: SpotPhotoGalleryProps) {
  const [selectedUrl, setSelectedUrl] = useState(photos[0]?.url);
  const [failedGooglePhotos, setFailedGooglePhotos] = useState<string[]>([]);
  const [displayedImage, setDisplayedImage] = useState<{ key: string; source: string } | null>(null);
  const [thumbnailSources, setThumbnailSources] = useState<Record<string, string>>({});
  const availablePhotos = photos.filter((photo) => !photo.google || !failedGooglePhotos.includes(photo.url));
  const activePhoto = availablePhotos.find((photo) => photo.url === selectedUrl) ?? availablePhotos[0];
  const selectedImage = activePhoto ? availablePhotos.indexOf(activePhoto) : 0;
  const activeImage = activePhoto?.url;
  const imageKey = JSON.stringify([activeImage, similarImage?.url]);
  const displayedSource = displayedImage?.key === imageKey
    ? displayedImage.source
    : activeImage ?? similarImage?.url;
  const activeImageCredit = getVerifiedSpotImageCredit(displayedSource);
  const isSimilarImage = !!similarImage && displayedSource === similarImage.url;
  const activeGoogle = displayedSource === activeImage ? activePhoto?.google : undefined;
  // 대표 사진이 실패해도 보이는 Google 썸네일에는 공통 Google Maps 출처가 필요하다.
  const thumbnailGoogle = availablePhotos.length > 1 ? availablePhotos.find((photo) => {
    const source = photo.thumbnailUrl ?? photo.url;
    return photo.google && (thumbnailSources[photo.url] ?? source) === source;
  })?.google : undefined;
  const googleAttribution = activeGoogle ?? (thumbnailGoogle ? { ...thumbnailGoogle, authors: [], flagUrl: undefined } : undefined);
  const markGooglePhotoUnavailable = useCallback((photo: SpotGalleryPhoto) => {
    setFailedGooglePhotos((previous) => previous.includes(photo.url) ? previous : [...previous, photo.url]);
  }, []);
  const handleImageSourceChange = useCallback((source: string) => {
    setDisplayedImage({ key: imageKey, source });
    if (activePhoto?.google && source !== activeImage) markGooglePhotoUnavailable(activePhoto);
  }, [imageKey, activeImage, activePhoto, markGooglePhotoUnavailable]);
  const handleThumbnailSourceChange = useCallback((photo: SpotGalleryPhoto, source: string) => {
    setThumbnailSources((previous) => previous[photo.url] === source ? previous : { ...previous, [photo.url]: source });
    if (photo.google && source !== (photo.thumbnailUrl ?? photo.url)) markGooglePhotoUnavailable(photo);
  }, [markGooglePhotoUnavailable]);

  useEffect(() => {
    if (photos.length > 0 && availablePhotos.length === 0) onUnavailable?.();
  }, [photos.length, availablePhotos.length, onUnavailable]);

  return (
    <>
      <div className="relative aspect-[4/3] overflow-hidden rounded-[18px] bg-muted sm:aspect-[16/10]">
        <SpotImage
          className="h-full w-full object-cover"
          src={activeImage}
          alt={title}
          similarImage={similarImage}
          onSourceChange={handleImageSourceChange}
        />
        {availablePhotos.length > 1 ? (
          <>
            <button type="button" aria-label="이전 사진" onClick={() => setSelectedUrl(availablePhotos[(selectedImage - 1 + availablePhotos.length) % availablePhotos.length].url)} className={`absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-sm transition-colors hover:bg-white ${FOCUS_RING}`}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" aria-label="다음 사진" onClick={() => setSelectedUrl(availablePhotos[(selectedImage + 1) % availablePhotos.length].url)} className={`absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-zinc-800 shadow-sm transition-colors hover:bg-white ${FOCUS_RING}`}>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>
      {isSimilarImage ? (
        <p className="px-2 pb-1 pt-3 text-xs leading-5 text-muted-foreground sm:px-3">
          ‘유사 이미지’는 실제 장소 사진이 아닙니다.{" "}
          <Link to="/image-credits#similar-images" className={CREDIT_LINK}>유사 이미지 출처</Link>
        </p>
      ) : null}
      {availablePhotos.length > 1 ? (
        <div className="flex items-center justify-end gap-1.5 px-2 pt-3 text-xs font-medium text-muted-foreground sm:px-3" role="status" aria-label="현재 사진">
          <Images className="h-3.5 w-3.5" aria-hidden="true" />
          {selectedImage + 1} / {availablePhotos.length}
        </div>
      ) : null}
      {availablePhotos.length > 1 ? (
        <div className="mt-2 flex gap-2 overflow-x-auto p-1 sm:mt-3 sm:gap-3" aria-label="사진 선택">
          {availablePhotos.map((photo, index) => (
            <GalleryThumbnail
              key={`${photo.url}:${photos.indexOf(photo)}`}
              photo={photo}
              title={title}
              index={index}
              selected={selectedImage === index}
              onSelect={() => setSelectedUrl(photo.url)}
              onSourceChange={handleThumbnailSourceChange}
            />
          ))}
        </div>
      ) : null}
      {googleAttribution ? (
        <div role="group" aria-label="대표 사진 출처">
          <GooglePhotoAttribution google={googleAttribution} className="px-2 pb-1 pt-3 sm:px-3" />
        </div>
      ) : null}
      {activeImageCredit && !activeGoogle ? (
        <p className="px-2 pb-1 pt-3 text-xs leading-5 text-muted-foreground sm:px-3">
          사진: {activeImageCredit.author} · {activeImageCredit.license}{" "}
          <Link to={`/image-credits#${activeImageCredit.id}`} className={cn("ml-1", CREDIT_LINK)}>사진 출처</Link>
        </p>
      ) : null}
    </>
  );
}
