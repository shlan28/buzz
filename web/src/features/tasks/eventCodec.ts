import type { NostrEvent } from "@/shared/lib/nostr-client";
import { KINDS } from "@/shared/domain/eventKinds";
import { firstTag, semanticTag } from "@/shared/domain/eventTags";
import type {
  Task,
  TaskExecution,
  TaskExecutionStatus,
  TaskStatus,
} from "./types";

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
    eventId: event.id,
    title,
    description: event.content,
    status: rawStatus && statuses.has(rawStatus) ? rawStatus : "todo",
    priority: semanticTag(event.tags, "task-priority:") ?? "none",
    assignee: firstTag(event.tags, "p"),
    channelId: firstTag(event.tags, "h"),
    due: due && !Number.isNaN(due.getTime()) ? due : undefined,
    trackId: semanticTag(event.tags, "track-id:"),
    labels: event.tags
      .filter((tag) => tag[0] === "t" && tag[1]?.startsWith("label:"))
      .map((tag) => tag[1].slice(6)),
    archived: firstTag(event.tags, "archived") === "true",
    updatedAt: event.created_at,
  };
}

const executionStatuses = new Set<TaskExecutionStatus>([
  "queued",
  "running",
  "finished",
  "failed",
  "cancelled",
]);

export function parseTaskExecution(
  event: NostrEvent,
  relaySelfPubkey: string,
): TaskExecution | null {
  if (
    event.kind !== KINDS.taskExecutionState ||
    event.pubkey.toLowerCase() !== relaySelfPubkey.toLowerCase()
  ) {
    return null;
  }
  const id = firstTag(event.tags, "d");
  const taskId = semanticTag(event.tags, "task-id:");
  const assignee = firstTag(event.tags, "p");
  const requester = firstTag(event.tags, "requester");
  const status = firstTag(event.tags, "status") as
    | TaskExecutionStatus
    | undefined;
  if (
    !id ||
    !taskId ||
    !assignee ||
    !requester ||
    !status ||
    !executionStatuses.has(status)
  ) {
    return null;
  }
  return {
    id,
    eventId: event.id,
    taskId,
    assignee,
    owner: firstTag(event.tags, "owner"),
    requester,
    status,
    message: event.content,
    sourceEvent: firstTag(event.tags, "source_event"),
    updatedAt: event.created_at,
  };
}

export function latestTaskExecutions(executions: TaskExecution[]) {
  const byTask = new Map<string, TaskExecution>();
  for (const execution of executions) {
    const current = byTask.get(execution.taskId);
    if (
      !current ||
      execution.updatedAt > current.updatedAt ||
      (execution.updatedAt === current.updatedAt &&
        execution.eventId.localeCompare(current.eventId) > 0)
    ) {
      byTask.set(execution.taskId, execution);
    }
  }
  return byTask;
}

export function latestTaskExecutionStates(executions: TaskExecution[]) {
  const byExecution = new Map<string, TaskExecution>();
  for (const execution of executions) {
    const current = byExecution.get(execution.id);
    if (
      !current ||
      execution.updatedAt > current.updatedAt ||
      (execution.updatedAt === current.updatedAt &&
        execution.eventId.localeCompare(current.eventId) > 0)
    ) {
      byExecution.set(execution.id, execution);
    }
  }
  return byExecution;
}
