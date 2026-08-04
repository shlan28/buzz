import type { TaskAssignee } from "../types";

export function resolveTaskAssigneeCandidate(
  pubkey: string | null,
  assignees: readonly TaskAssignee[],
): string | null | undefined {
  const candidate = assignees.find((assignee) =>
    pubkey === null
      ? assignee.pubkey === null
      : assignee.pubkey?.toLowerCase() === pubkey.toLowerCase(),
  );
  return candidate?.pubkey;
}
