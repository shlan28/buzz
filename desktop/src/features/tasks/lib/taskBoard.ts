import type { Task, TaskAssignee, TaskFilters, TaskStatus } from "../types";

export type TaskColumnModel = {
  id: string;
  label: string;
  kind: TaskAssignee["kind"] | "status";
  pubkey: string | null;
  status?: TaskStatus;
  canAssign?: boolean;
  tasks: Task[];
};

const STATUS_ORDER = new Map([
  ["blocked", 0],
  ["in-progress", 1],
  ["todo", 2],
  ["backlog", 3],
  ["done", 4],
]);
const PRIORITY_ORDER = new Map([
  ["urgent", 0],
  ["high", 1],
  ["medium", 2],
  ["low", 3],
  ["none", 4],
]);

export function filterTasks(tasks: Task[], filters: TaskFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return tasks.filter(
    (task) =>
      !task.archived &&
      (filters.showDone || task.status !== "done") &&
      (filters.statuses.size === 0 || filters.statuses.has(task.status)) &&
      (filters.labels.size === 0 ||
        task.labels.some((label) => filters.labels.has(label))) &&
      (filters.projects.size === 0 ||
        (task.project !== null && filters.projects.has(task.project))) &&
      (filters.channels.size === 0 ||
        (task.channelId !== null && filters.channels.has(task.channelId))) &&
      (!query ||
        task.title.toLocaleLowerCase().includes(query) ||
        task.description.toLocaleLowerCase().includes(query)),
  );
}

export function buildTaskColumns(
  tasks: Task[],
  assignees: TaskAssignee[],
  currentPubkey: string | undefined,
  showEmpty: boolean,
): TaskColumnModel[] {
  const normalizedCurrent = currentPubkey?.toLowerCase();
  const byAssignee = new Map<string, Task[]>();
  for (const task of tasks) {
    const key = task.assignee?.toLowerCase() ?? "";
    byAssignee.set(key, [...(byAssignee.get(key) ?? []), task]);
  }
  const ordered = [...assignees].sort((a, b) => {
    if (a.pubkey === null) return -1;
    if (b.pubkey === null) return 1;
    if (a.pubkey.toLowerCase() === normalizedCurrent) return -1;
    if (b.pubkey.toLowerCase() === normalizedCurrent) return 1;
    const taskDelta =
      (byAssignee.get(b.pubkey.toLowerCase())?.length ?? 0) -
      (byAssignee.get(a.pubkey.toLowerCase())?.length ?? 0);
    return taskDelta || a.label.localeCompare(b.label);
  });
  return ordered
    .map((assignee) => ({
      ...assignee,
      id: assignee.pubkey ?? "unassigned",
      tasks: [
        ...(byAssignee.get(assignee.pubkey?.toLowerCase() ?? "") ?? []),
      ].sort(
        (a, b) =>
          (STATUS_ORDER.get(a.status) ?? 9) -
            (STATUS_ORDER.get(b.status) ?? 9) ||
          (PRIORITY_ORDER.get(a.priority) ?? 9) -
            (PRIORITY_ORDER.get(b.priority) ?? 9) ||
          a.updatedAt - b.updatedAt,
      ),
    }))
    .filter((column) => showEmpty || column.tasks.length > 0);
}

const BOARD_STATUSES: { status: TaskStatus; label: string }[] = [
  { status: "backlog", label: "Backlog" },
  { status: "todo", label: "Todo" },
  { status: "in-progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

export function buildTaskStatusColumns(
  tasks: Task[],
  showEmpty: boolean,
  includeDone: boolean,
): TaskColumnModel[] {
  return BOARD_STATUSES.filter(({ status }) => includeDone || status !== "done")
    .map(({ status, label }) => ({
      id: status,
      label,
      kind: "status" as const,
      pubkey: null,
      status,
      tasks: tasks
        .filter((task) => task.status === status)
        .sort(
          (a, b) =>
            (PRIORITY_ORDER.get(a.priority) ?? 9) -
              (PRIORITY_ORDER.get(b.priority) ?? 9) ||
            a.updatedAt - b.updatedAt,
        ),
    }))
    .filter((column) => showEmpty || column.tasks.length > 0);
}
