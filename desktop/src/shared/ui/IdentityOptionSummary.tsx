import { cn } from "@/shared/lib/cn";
import { Badge } from "@/shared/ui/badge";
import { Skeleton } from "@/shared/ui/skeleton";

export function IdentityOptionSummary({
  label,
  shortId,
  kind,
  isNameLoading = false,
  unavailableReason,
  compact = false,
}: {
  label: string;
  shortId?: string | null;
  kind?: "person" | "agent";
  isNameLoading?: boolean;
  unavailableReason?: string;
  compact?: boolean;
}) {
  if (!kind) {
    return <span className="min-w-0 flex-1 truncate text-left">{label}</span>;
  }

  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <span className="min-w-0 flex-1">
        {isNameLoading ? (
          <Skeleton
            className={cn("w-28 max-w-full", compact ? "h-3" : "mb-1 h-4")}
          />
        ) : (
          <span
            className={cn(
              "block truncate font-medium",
              compact ? "text-xs" : "text-sm",
            )}
          >
            {label}
          </span>
        )}
        {!compact && shortId ? (
          <span className="block truncate text-xs text-muted-foreground">
            {shortId}
          </span>
        ) : null}
        {!compact && unavailableReason ? (
          <span className="block text-xs text-muted-foreground">
            {unavailableReason}
          </span>
        ) : null}
      </span>
      <Badge className="shrink-0" variant="outline">
        {kind === "agent" ? "Agent" : "User"}
      </Badge>
    </span>
  );
}
