import type { RelayEvent } from "@/shared/api/types";
import {
  KIND_TASK_CREATE,
  KIND_TASK_MUTATE,
  KIND_TASK_STATE,
} from "@/shared/constants/kinds";
import type {
  Task,
  TaskDraft,
  TaskHistoryEntry,
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

export function buildCreateTaskEvent(draft: TaskDraft) {
  return {
    kind: KIND_TASK_CREATE as typeof KIND_TASK_CREATE,
    content: draft.description,
    tags: taskFieldTags(draft),
  };
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
  if (patch.description !== undefined)
    tags.push([patch.description.length > 0 ? "set" : "clear", "description"]);
  if (patch.archived !== undefined)
    tags.push(["archived", String(patch.archived)]);
  return {
    kind: KIND_TASK_MUTATE as typeof KIND_TASK_MUTATE,
    content: patch.description ?? "",
    tags,
  };
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
  return tags;
}

function parseDueTimestamp(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}
