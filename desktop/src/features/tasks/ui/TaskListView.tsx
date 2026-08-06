import { CalendarDays, CircleAlert, UserRound } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import {
  dueTimestampToLocalDate,
  isDueTimestampOverdue,
} from "../lib/taskDates";
import type { Task, TaskAssignee, TaskExecution } from "../types";
import { TaskStatusBadge } from "./TaskStatusBadge";

export function TaskListView({
  tasks,
  assignees,
  onOpen,
  executions,
  trackNames,
}: {
  tasks: Task[];
  assignees: TaskAssignee[];
  onOpen: (taskId: string) => void;
  executions: ReadonlyMap<string, TaskExecution>;
  trackNames?: ReadonlyMap<string, string>;
}) {
  const labels = new Map(
    assignees
      .filter((assignee) => assignee.pubkey !== null)
      .map((assignee) => [assignee.pubkey?.toLowerCase(), assignee.label]),
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <div
        className="w-full divide-y divide-border overflow-hidden rounded-xl border border-border"
        data-testid="task-list-view"
      >
        {tasks.map((task) => {
          const overdue =
            task.status !== "done" && isDueTimestampOverdue(task.dueDate);
          const assignee = task.assignee
            ? (labels.get(task.assignee.toLowerCase()) ?? "Unknown assignee")
            : "Unassigned";
          return (
            <button
              className="grid w-full grid-cols-1 items-center gap-2 px-4 py-3 text-left hover:bg-muted/40 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] sm:gap-4"
              data-testid={`task-list-row-${task.id}`}
              key={task.id}
              onClick={() => onOpen(task.id)}
              type="button"
            >
              <span className="min-w-0 truncate text-sm font-medium">
                {task.title}
                {task.trackId && trackNames?.get(task.trackId) ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {trackNames.get(task.trackId)}
                  </span>
                ) : null}
                {task.labels.slice(0, 2).map((label) => (
                  <span
                    className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground"
                    key={label}
                  >
                    {label}
                  </span>
                ))}
                {task.labels.length > 2 ? (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    +{task.labels.length - 2}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-1.5">
                <TaskStatusBadge status={task.status} />
                {executions.get(task.id)?.status === "running" ? (
                  <span className="text-xs text-blue-700 dark:text-blue-300">
                    Running
                  </span>
                ) : null}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <UserRound className="h-3 w-3" />
                {assignee}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs text-muted-foreground",
                  overdue && "text-destructive",
                )}
              >
                {overdue ? (
                  <CircleAlert className="h-3 w-3" />
                ) : (
                  <CalendarDays className="h-3 w-3" />
                )}
                {task.dueDate === null
                  ? "No due date"
                  : dueTimestampToLocalDate(task.dueDate)}
              </span>
              <span
                className={cn(
                  "text-xs capitalize text-muted-foreground",
                  task.priority === "urgent" && "text-destructive",
                )}
              >
                {task.priority === "none" ? "No priority" : task.priority}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
