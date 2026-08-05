import type { TaskAssignmentPolicy } from "@/shared/api/types";

export function resolveTaskAssignmentAccess(input: {
  viewerPubkey?: string;
  ownerPubkey?: string | null;
  policy: TaskAssignmentPolicy | null;
  allowlist: readonly string[];
  locallyManaged: boolean;
}) {
  if (input.locallyManaged) return { allowed: true };
  const viewer = input.viewerPubkey?.toLowerCase();
  if (!viewer) return { allowed: false, reason: "Sign in to assign tasks" };
  if (input.ownerPubkey?.toLowerCase() === viewer) return { allowed: true };
  if (input.policy === "anyone") return { allowed: true };
  if (
    input.policy === "allowlist" &&
    input.allowlist.some((key) => key.toLowerCase() === viewer)
  )
    return { allowed: true };
  if (input.policy === null)
    return {
      allowed: false,
      reason: "Assignment access is unavailable; the Relay must verify it",
    };
  return {
    allowed: false,
    reason:
      input.policy === "owner_only"
        ? "Only the Agent owner can assign tasks"
        : "You are not on this Agent's task allowlist",
  };
}
