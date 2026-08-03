export type TaskStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "blocked"
  | "done";

export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";

export type Task = {
  id: string;
  eventId: string;
  title: string;
  description: string;
  assignee: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  labels: string[];
  project: string | null;
  channelId: string | null;
  creator: string;
  lastEditor: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
};

export type TaskDraft = Pick<
  Task,
  "title" | "description" | "assignee" | "status" | "priority" | "dueDate"
> & { id: string };

export type TaskPatch = Partial<TaskDraft> & { archived?: boolean };

export type TaskAssignee = {
  pubkey: string | null;
  label: string;
  kind: "unassigned" | "person" | "agent";
  canAssign?: boolean;
  unavailableReason?: string;
};

export type TaskFilters = {
  query: string;
  statuses: ReadonlySet<TaskStatus>;
  showDone: boolean;
  showEmptyAssignees: boolean;
};
