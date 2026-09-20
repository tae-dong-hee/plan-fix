import { useState, type ImgHTMLAttributes } from "react";
import fallbackSpotImage from "@/assets/spot-placeholder.svg";
import { getVerifiedSpotImageCredit, getVerifiedSpotImageTitle } from "@/lib/verified-spot-images";
import { cn } from "@/lib/utils";

export const FALLBACK_SPOT_IMAGE = fallbackSpotImage;

type SpotImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src?: string | null;
  alt: string;
  similarImage?: {
    url: string;
    title: string;
    author: string;
    license: string;
    sourceUrl: string;
  };
};

/** 원본 → 선택한 유사 이미지 → 기본 그림 순서로 복구한다. */
export default function SpotImage(props: SpotImageProps) {
  return <SpotImageContent key={JSON.stringify([props.src?.trim(), props.similarImage?.url])} {...props} />;
}

function SpotImageContent({ src, alt, title, className, similarImage, ...props }: SpotImageProps) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const displayedSource = [src?.trim(), similarImage?.url].find(
    (source): source is string => !!source && !failedSources.includes(source),
  ) ?? FALLBACK_SPOT_IMAGE;
  const isSimilar = !!similarImage && displayedSource === similarImage.url;
  const credit = getVerifiedSpotImageCredit(displayedSource);
  const similarTitle = similarImage
    ? `유사 이미지: ${similarImage.title} · 실제 장소 사진이 아닙니다. · 사진: ${similarImage.author} · ${similarImage.license} · 출처: ${similarImage.sourceUrl}`
    : undefined;

  return (
    <>
      <img
        {...props}
        src={displayedSource}
        alt={isSimilar ? `${alt} 유사 이미지: ${similarImage.title}` : alt}
        title={isSimilar ? similarTitle : title ?? getVerifiedSpotImageTitle(displayedSource)}
        className={credit ? cn(className, "object-contain scale-100 hover:scale-100 group-hover:scale-100") : className}
        onError={() => {
          if (displayedSource !== FALLBACK_SPOT_IMAGE) {
            setFailedSources((previous) => [...previous, displayedSource]);
          }
        }}
      />
      {isSimilar ? (
        <span
          className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium leading-none text-white sm:text-[11px]"
          aria-hidden="true"
        >
          유사 이미지
        </span>
      ) : null}
    </>
  );
}
