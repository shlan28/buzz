import { Bot, CalendarDays, CircleAlert, UserRound } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { truncatePubkey } from "@/shared/lib/pubkey";
import type { Task, TaskAssignee, TaskExecution } from "../types";
import {
  dueTimestampToLocalDate,
  isDueTimestampOverdue,
} from "../lib/taskDates";
import { TaskStatusBadge } from "./TaskStatusBadge";

export function TaskCard({
  task,
  assignee,
  onOpen,
  execution,
  trackName,
}: {
  task: Task;
  assignee?: TaskAssignee;
  onOpen: () => void;
  execution?: TaskExecution;
  trackName?: string;
}) {
  const overdue = task.status !== "done" && isDueTimestampOverdue(task.dueDate);
  return (
    <article
      className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-muted/30 focus-within:ring-2 focus-within:ring-ring"
      data-testid={`task-card-${task.id}`}
    >
      <button
        className="line-clamp-2 w-full text-left text-sm font-medium text-card-foreground"
        onClick={onOpen}
        type="button"
      >
        {task.title}
      </button>
      <p
        className={cn(
          "mt-1 line-clamp-2 min-h-10 text-xs leading-5",
          task.description
            ? "text-muted-foreground"
            : "text-muted-foreground/60",
        )}
      >
        {task.description || "No description"}
      </p>
      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <TaskStatusBadge status={task.status} />
        {execution?.status === "queued" ||
        execution?.status === "running" ||
        execution?.status === "failed" ? (
          <span
            className={cn(
              "rounded-full border border-border px-1.5 py-0.5 capitalize",
              execution.status === "running" &&
                "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
              execution.status === "failed" &&
                "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {execution.status}
          </span>
        ) : null}
        {trackName ? (
          <span className="rounded-md bg-muted px-1.5 py-0.5">{trackName}</span>
        ) : null}
        {task.labels.slice(0, 2).map((label) => (
          <span className="rounded-md bg-muted px-1.5 py-0.5" key={label}>
            {label}
          </span>
        ))}
        {task.labels.length > 2 ? <span>+{task.labels.length - 2}</span> : null}
        {task.priority !== "none" ? (
          <span
            className={cn(
              "capitalize",
              task.priority === "urgent" && "text-destructive",
            )}
          >
            {task.priority}
          </span>
        ) : null}
        {task.dueDate !== null ? (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              overdue && "text-destructive",
            )}
          >
            {overdue ? (
              <CircleAlert className="h-3 w-3" />
            ) : (
              <CalendarDays className="h-3 w-3" />
            )}
            {dueTimestampToLocalDate(task.dueDate)}
          </span>
        ) : null}
      </span>
      <div
        className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
        data-testid="task-card-assignee"
      >
        {assignee?.kind === "agent" ? (
          <Bot className="h-3.5 w-3.5" />
        ) : (
          <UserRound className="h-3.5 w-3.5" />
        )}
        <span className="truncate">
          {assignee?.label ??
            (task.assignee ? truncatePubkey(task.assignee) : "Unassigned")}
        </span>
        {assignee?.kind === "agent" ? <span>· Agent</span> : null}
      </div>
    </article>
  );
}
