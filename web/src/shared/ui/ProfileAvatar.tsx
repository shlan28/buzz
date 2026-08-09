import { useState } from "react";
import { cn } from "@/shared/lib/cn";

type ProfileAvatarProps = {
  avatarUrl?: string | null;
  className?: string;
  isAgent?: boolean;
  label: string;
  testId?: string;
};

export function ProfileAvatar({
  avatarUrl,
  className,
  isAgent = false,
  label,
  testId,
}: ProfileAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const resolvedAvatarUrl = isDefaultPlaceholderAvatar(avatarUrl)
    ? null
    : avatarUrl;

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
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold",
        isAgent
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-secondary-foreground",
        className,
      )}
      data-testid={testId}
      role="img"
    >
      {resolvedAvatarUrl && failedUrl !== resolvedAvatarUrl ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(resolvedAvatarUrl)}
          referrerPolicy="no-referrer"
          src={resolvedAvatarUrl}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}

export function isDefaultPlaceholderAvatar(url?: string | null) {
  if (!url?.startsWith("data:image/svg+xml")) return false;
  try {
    const [, payload = ""] = url.split(",", 2);
    const svg = url.includes(";base64,")
      ? atob(payload)
      : decodeURIComponent(payload);
    const visibleElements =
      svg.match(/<(rect|circle|ellipse|path|image|text)\b/gi) ?? [];
    return visibleElements.length === 1 && /^<rect\b/i.test(visibleElements[0]);
  } catch {
    return false;
  }
}
