import { useState, type ImgHTMLAttributes } from "react";
import fallbackSpotImage from "@/assets/spot-placeholder.svg";
import { getVerifiedSpotImageCredit, getVerifiedSpotImageTitle } from "@/lib/verified-spot-images";
import { cn } from "@/lib/utils";

export const FALLBACK_SPOT_IMAGE = fallbackSpotImage;

type SpotImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src?: string | null;
  alt: string;
};

/** 누락되거나 불러오지 못한 장소 사진은 앱에 포함된 기본 이미지로 표시한다. */
export default function SpotImage({ src, alt, title, className, ...props }: SpotImageProps) {
  const source = src?.trim() || FALLBACK_SPOT_IMAGE;
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const displayedSource = source === failedSource ? FALLBACK_SPOT_IMAGE : source;
  const credit = getVerifiedSpotImageCredit(displayedSource);

  return (
    <img
      {...props}
      src={displayedSource}
      alt={alt}
      title={title ?? getVerifiedSpotImageTitle(displayedSource)}
      className={credit ? cn(className, "object-contain scale-100 hover:scale-100 group-hover:scale-100") : className}
      onError={() => setFailedSource(source)}
    />
  );
}
