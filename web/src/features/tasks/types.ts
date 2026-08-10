export type TaskStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "blocked"
  | "done";
export type Task = {
  id: string;
  eventId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  assignee?: string;
  channelId?: string;
  due?: Date;
  trackId?: string;
  labels: string[];
  archived: boolean;
  updatedAt: number;
};

export type TaskExecutionStatus =
  | "queued"
  | "running"
  | "finished"
  | "failed"
  | "cancelled";

export type TaskExecution = {
  id: string;
  eventId: string;
  taskId: string;
  assignee: string;
  owner?: string;
  requester: string;
  status: TaskExecutionStatus;
  message: string;
  sourceEvent?: string;
  updatedAt: number;
};
