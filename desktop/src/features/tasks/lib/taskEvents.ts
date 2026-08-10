import type { RelayEvent } from "@/shared/api/types";
import {
  KIND_TASK_CREATE,
  KIND_TASK_DELETE,
  KIND_TASK_EXECUTION_REQUEST,
  KIND_TASK_EXECUTION_STATE,
  KIND_TASK_EXECUTION_UPDATE,
  KIND_TASK_MUTATE,
  KIND_TASK_STATE,
} from "@/shared/constants/kinds";
import type {
  Task,
  TaskDraft,
  TaskHistoryEntry,
  TaskExecution,
  TaskExecutionStatus,
  TaskPatch,
  TaskPriority,
  TaskStatus,
} from "../types";

const STATUSES = new Set<TaskStatus>([
  "backlog",
  "todo",
  "in-progress",
  "blocked",
  "done",
]);
const PRIORITIES = new Set<TaskPriority>([
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);
const EXECUTION_STATUSES = new Set<TaskExecutionStatus>([
  "queued",
  "running",
  "finished",
  "failed",
  "cancelled",
]);

function firstTag(event: RelayEvent, name: string) {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

export function parseTaskHistoryEvent(
  event: RelayEvent,
  taskId: string,
): TaskHistoryEntry | null {
  if (event.kind !== KIND_TASK_CREATE && event.kind !== KIND_TASK_MUTATE)
    return null;
  if (semanticTag(event, "task-id:") !== taskId) return null;
  const changes: string[] = [];
  const add = (name: string, value?: string) => {
    if (value) changes.push(`${name}: ${value}`);
  };
  add("Title", firstTag(event, "title"));
  add("Assignee", firstTag(event, "p"));
  add("Status", semanticTag(event, "task-status:"));
  add("Priority", semanticTag(event, "task-priority:"));
  add("Track", semanticTag(event, "track-id:"));
  add("Due", firstTag(event, "due"));
  add("Project", event.tags.find((tag) => tag[0] === "a")?.[1]);
  add("Channel", firstTag(event, "h"));
  for (const label of event.tags
    .filter((tag) => tag[0] === "t" && tag[1]?.startsWith("label:"))
    .map((tag) => tag[1].slice(6)))
    add("Label", label);
  for (const clear of event.tags.filter((tag) => tag[0] === "clear"))
    add("Cleared", clear[1]);
  if (event.tags.some((tag) => tag[0] === "set" && tag[1] === "description"))
    changes.push("Description updated");
  if (event.kind === KIND_TASK_CREATE && event.content)
    changes.push("Description added");
  if (firstTag(event, "archived") === "true") changes.push("Archived");
  return {
    id: event.id,
    actor: event.pubkey,
    createdAt: event.created_at,
    action: event.kind === KIND_TASK_CREATE ? "created" : "updated",
    changes: changes.length > 0 ? changes : ["Task updated"],
  };
}

function semanticTag(event: RelayEvent, prefix: string) {
  return event.tags
    .filter((tag) => tag[0] === "t")
    .map((tag) => tag[1] ?? "")
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

export function parseTaskState(
  event: RelayEvent,
  relaySelfPubkey: string,
): Task | null {
  if (
    event.kind !== KIND_TASK_STATE ||
    event.pubkey.toLowerCase() !== relaySelfPubkey.toLowerCase()
  )
    return null;
  const id = firstTag(event, "d");
  const title = firstTag(event, "title");
  if (!id || !title) return null;
  const rawStatus = semanticTag(event, "task-status:");
  const rawPriority = semanticTag(event, "task-priority:");
  const status = STATUSES.has(rawStatus as TaskStatus)
    ? (rawStatus as TaskStatus)
    : "todo";
  const priority = PRIORITIES.has(rawPriority as TaskPriority)
    ? (rawPriority as TaskPriority)
    : "none";
  const assignee = firstTag(event, "p") ?? null;
  return {
    id,
    eventId: event.id,
    title,
    description: event.content,
    assignee,
    status,
    priority,
    dueDate: parseDueTimestamp(firstTag(event, "due")),
    labels: event.tags
      .filter((tag) => tag[0] === "t" && tag[1]?.startsWith("label:"))
      .map((tag) => tag[1].slice(6)),
    trackId: semanticTag(event, "track-id:") ?? null,
    project:
      event.tags.find(
        (tag) => tag[0] === "a" && tag[1]?.startsWith("30617:"),
      )?.[1] ?? null,
    channelId: firstTag(event, "h") ?? null,
    creator: firstTag(event, "creator") ?? event.pubkey,
    lastEditor: firstTag(event, "last_editor") ?? event.pubkey,
    createdAt: Number(firstTag(event, "created_at") ?? event.created_at),
    updatedAt: event.created_at,
    archived: firstTag(event, "archived") === "true",
  };
}

export function parseTaskExecutionState(
  event: RelayEvent,
  relaySelfPubkey: string,
): TaskExecution | null {
  if (
    event.kind !== KIND_TASK_EXECUTION_STATE ||
    event.pubkey.toLowerCase() !== relaySelfPubkey.toLowerCase()
  )
    return null;
  const id = firstTag(event, "d");
  const taskId = semanticTag(event, "task-id:");
  const assignee = firstTag(event, "p");
  const requester = firstTag(event, "requester");
  const status = firstTag(event, "status") as TaskExecutionStatus | undefined;
  if (
    !id ||
    !taskId ||
    !assignee ||
    !requester ||
    !status ||
    !EXECUTION_STATUSES.has(status)
  )
    return null;
  return {
    id,
    eventId: event.id,
    taskId,
    assignee,
    owner: firstTag(event, "owner") ?? null,
    requester,
    status,
    message: event.content,
    updatedAt: event.created_at,
  };
}

export function buildExecuteTaskEvent(task: Task) {
  if (!task.assignee) throw new Error("Task is not assigned to an Agent.");
  const tags: string[][] = [
    ["t", `task-id:${task.id}`],
    ["d", crypto.randomUUID()],
    ["previous", task.eventId],
    ["e", task.eventId, "", "task-state"],
    ["p", task.assignee, "", "agent"],
  ];
  if (task.channelId) tags.push(["h", task.channelId]);
  return { kind: KIND_TASK_EXECUTION_REQUEST, content: "", tags };
}

export function buildCancelTaskExecutionEvent(execution: TaskExecution) {
  return {
    kind: KIND_TASK_EXECUTION_UPDATE,
    content: "Cancelled by user",
    tags: [
      ["t", `task-id:${execution.taskId}`],
      ["d", execution.id],
      ["status", "cancelled"],
      ["p", execution.assignee, "", "agent"],
    ],
  };
}

export function buildCreateTaskEvent(draft: TaskDraft) {
  return {
    kind: KIND_TASK_CREATE as typeof KIND_TASK_CREATE,
    content: draft.description,
    tags: taskFieldTags(draft),
  };
}

export function assertTaskAssigneeTags(
  tags: readonly (readonly string[])[],
  assignee: string | null | undefined,
) {
  if (assignee === undefined) return;
  const actual = tags.find((tag) => tag[0] === "p")?.[1] ?? null;
  const clearsAssignee = tags.some(
    (tag) => tag[0] === "clear" && tag[1] === "assignee",
  );
  if (
    assignee === null
      ? !clearsAssignee || actual !== null
      : actual?.toLowerCase() !== assignee.toLowerCase()
  ) {
    throw new Error("Task assignee was lost before publishing.");
  }
}

export function buildMutateTaskEvent(task: Task, patch: TaskPatch) {
  const tags: string[][] = [
    ["t", `task-id:${task.id}`],
    ["action", "update"],
    ["previous", task.eventId],
    ["e", task.eventId, "", "previous"],
  ];
  if (patch.title !== undefined) tags.push(["title", patch.title.trim()]);
  if (patch.assignee !== undefined) {
    if (patch.assignee) tags.push(["p", patch.assignee]);
    else tags.push(["clear", "assignee"]);
  }
  if (patch.status !== undefined)
    tags.push(["t", `task-status:${patch.status}`]);
  if (patch.priority !== undefined)
    tags.push(["t", `task-priority:${patch.priority}`]);
  if (patch.dueDate !== undefined) {
    if (patch.dueDate !== null) tags.push(["due", String(patch.dueDate)]);
    else tags.push(["clear", "due"]);
  }
  if (patch.labels !== undefined) {
    tags.push(["clear", "labels"]);
    for (const label of uniqueLabels(patch.labels))
      tags.push(["t", `label:${label}`]);
  }
  if (patch.trackId !== undefined) {
    if (patch.trackId) tags.push(["t", `track-id:${patch.trackId}`]);
    else tags.push(["clear", "track"]);
  }
  if (patch.description !== undefined)
    tags.push([patch.description.length > 0 ? "set" : "clear", "description"]);
  if (patch.archived !== undefined)
    tags.push(["archived", String(patch.archived)]);
  if (tags.length === 4)
    throw new Error("Task update does not contain any changes.");
  return {
    kind: KIND_TASK_MUTATE as typeof KIND_TASK_MUTATE,
    content: patch.description ?? "",
    tags,
  };
}

export function buildDeleteTaskEvent(task: Task) {
  return {
    kind: KIND_TASK_DELETE as typeof KIND_TASK_DELETE,
    content: "",
    tags: [
      ["t", `task-id:${task.id}`],
      ["previous", task.eventId],
      ["e", task.eventId, "", "previous"],
    ],
  };
}

export function taskIdFromDeleteEvent(event: RelayEvent): string | null {
  if (event.kind !== KIND_TASK_DELETE || event.content !== "") return null;
  const taskId = semanticTag(event, "task-id:");
  const previous = firstTag(event, "previous");
  const previousReference = event.tags.find(
    (tag) => tag[0] === "e" && tag[3] === "previous",
  )?.[1];
  return taskId && previous && previous === previousReference ? taskId : null;
}

function taskFieldTags(draft: TaskDraft): string[][] {
  const tags: string[][] = [
    ["t", `task-id:${draft.id}`],
    ["title", draft.title.trim()],
    ["t", `task-status:${draft.status}`],
    ["t", `task-priority:${draft.priority}`],
  ];
  if (draft.assignee) tags.push(["p", draft.assignee]);
  if (draft.dueDate !== null) tags.push(["due", String(draft.dueDate)]);
  for (const label of uniqueLabels(draft.labels ?? []))
    tags.push(["t", `label:${label}`]);
  if (draft.trackId) tags.push(["t", `track-id:${draft.trackId}`]);
  return tags;
}

function uniqueLabels(labels: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of labels) {
    const label = value.trim();
    const byteLength = new TextEncoder().encode(label).length;
    if (!label || byteLength > 64) {
      throw new Error("Task tags must contain between 1 and 64 bytes.");
    }
    const normalized = label.toLocaleLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(label);
  }
  return result;
}

function parseDueTimestamp(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}
