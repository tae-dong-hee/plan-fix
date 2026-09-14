import { useState, type ImgHTMLAttributes } from "react";
import fallbackSpotImage from "@/assets/spot-placeholder.svg";

export const FALLBACK_SPOT_IMAGE = fallbackSpotImage;

type SpotImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src?: string | null;
  alt: string;
};

/** 누락되거나 불러오지 못한 장소 사진은 앱에 포함된 기본 이미지로 표시한다. */
export default function SpotImage({ src, alt, ...props }: SpotImageProps) {
  const source = src?.trim() || FALLBACK_SPOT_IMAGE;
  const [failedSource, setFailedSource] = useState<string | null>(null);

  return (
    <img
      {...props}
      src={source === failedSource ? FALLBACK_SPOT_IMAGE : source}
      alt={alt}
      onError={() => setFailedSource(source)}
    />
  );
}
