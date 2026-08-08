export type TaskStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "blocked"
  | "done";
export type Task = {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: string;
  assignee?: string;
  due?: Date;
  trackId?: string;
  labels: string[];
  archived: boolean;
  updatedAt: number;
};
