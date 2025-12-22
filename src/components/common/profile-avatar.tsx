import { cn } from "@/lib/utils";
import profileImage from "@/assets/profile.svg";
import { useState } from "react";

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  size?: number;
  className?: string;
  alt?: string;
}

export function ProfileAvatar({
  avatarUrl,
  size = 40,
  className,
  alt = "프로필",
}: ProfileAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const handleImageError = () => {
    setImageError(true);
  };

  const displayImage = avatarUrl && !imageError ? avatarUrl : profileImage;

  return (
    <img
      src={displayImage}
      alt={alt}
      className={cn("rounded-full object-cover", className)}
      style={{ width: size, height: size }}
      onError={handleImageError}
    />
  );
}

