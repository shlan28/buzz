import type { TaskAssignee } from "../types";

const OPTION_PREFIX = "task-assignee:";

export function taskAssigneeSelectValue(index: number): string {
  return `${OPTION_PREFIX}${index}`;
}

export function taskAssigneeFromSelectValue(
  value: string,
  assignees: readonly TaskAssignee[],
): string | null | undefined {
  if (!value.startsWith(OPTION_PREFIX)) return undefined;
  const rawIndex = value.slice(OPTION_PREFIX.length);
  if (!/^\d+$/.test(rawIndex)) return undefined;
  return assignees[Number(rawIndex)]?.pubkey;
}
