import { useState } from "react";
import { cn } from "@/shared/lib/cn";

type ProfileAvatarProps = {
  avatarUrl?: string | null;
  className?: string;
  label: string;
  testId?: string;
};

export function ProfileAvatar({
  avatarUrl,
  className,
  label,
  testId,
}: ProfileAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const initials =
    label
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <span
      aria-label={label}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold",
        className,
      )}
      data-testid={testId}
      role="img"
    >
      {avatarUrl && failedUrl !== avatarUrl ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
          referrerPolicy="no-referrer"
          src={avatarUrl}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
