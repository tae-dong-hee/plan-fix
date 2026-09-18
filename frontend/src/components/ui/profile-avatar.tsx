import { useState } from "react";
import { type DefaultAvatarColor, getProfileImageSrc } from "@/services/user";

const colors: Record<DefaultAvatarColor, { background: string; foreground: string }> = {
  violet: { background: "#EDE7FF", foreground: "#8961DB" },
  blue: { background: "#E0EEFF", foreground: "#5288D3" },
  green: { background: "#DDF3E9", foreground: "#409875" },
  amber: { background: "#FFF0D6", foreground: "#D09837" },
  rose: { background: "#FCE3EC", foreground: "#CC7295" },
};

interface ProfileAvatarProps {
  imageUrl: string | null;
  color: DefaultAvatarColor;
  className?: string;
}

export default function ProfileAvatar({ imageUrl, color, className = "" }: ProfileAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const palette = colors[color] ?? colors.violet;

  return (
    <div className={`overflow-hidden rounded-full ${className}`} style={{ backgroundColor: palette.background }}>
      {imageUrl && imageUrl !== failedUrl ? (
        <img
          src={getProfileImageSrc(imageUrl)}
          alt="프로필 사진"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <svg viewBox="0 0 100 100" role="img" aria-label="기본 프로필 이미지" className="h-full w-full" fill="none">
          <circle cx="50" cy="37" r="16" fill={palette.foreground} />
          <path d="M18 91c0-20 13-33 32-33s32 13 32 33" fill={palette.foreground} />
          <circle cx="80" cy="20" r="6" fill="white" fillOpacity=".55" />
          <circle cx="18" cy="55" r="4" fill="white" fillOpacity=".4" />
        </svg>
      )}
    </div>
  );
}
