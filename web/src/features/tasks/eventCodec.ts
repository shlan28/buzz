import type { NostrEvent } from "@/shared/lib/nostr-client";
import { KINDS } from "@/shared/domain/eventKinds";
import { firstTag, semanticTag } from "@/shared/domain/eventTags";
import type { Task, TaskStatus } from "./types";

const statuses = new Set<TaskStatus>([
  "backlog",
  "todo",
  "in-progress",
  "blocked",
  "done",
]);
export function parseTask(event: NostrEvent): Task | null {
  if (event.kind !== KINDS.taskState) return null;
  const id = firstTag(event.tags, "d");
  const title = firstTag(event.tags, "title")?.trim();
  if (!id || !title) return null;
  const rawStatus = semanticTag(event.tags, "task-status:") as
    | TaskStatus
    | undefined;
  const dueValue = firstTag(event.tags, "due");
  const due = dueValue
    ? new Date(/^\d+$/.test(dueValue) ? Number(dueValue) * 1000 : dueValue)
    : undefined;
  return {
    id,
    title,
    description: event.content,
    status: rawStatus && statuses.has(rawStatus) ? rawStatus : "todo",
    priority: semanticTag(event.tags, "task-priority:") ?? "none",
    assignee: firstTag(event.tags, "p"),
    due: due && !Number.isNaN(due.getTime()) ? due : undefined,
    trackId: semanticTag(event.tags, "track-id:"),
    labels: event.tags
      .filter((tag) => tag[0] === "t" && tag[1]?.startsWith("label:"))
      .map((tag) => tag[1].slice(6)),
    archived: firstTag(event.tags, "archived") === "true",
    updatedAt: event.created_at,
  };
}
