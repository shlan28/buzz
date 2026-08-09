import { Bot, CalendarDays, CircleAlert, UserRound } from "lucide-react";
import { profileLabel } from "@/features/profile/eventCodec";
import type { UserProfile } from "@/features/profile/types";
import { cn } from "@/shared/lib/cn";
import type { Task, TaskStatus } from "./types";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const presentation: Record<TaskStatus, { label: string; className: string }> =
    {
      backlog: {
        label: "Backlog",
        className: "bg-muted text-muted-foreground",
      },
      todo: {
        label: "Todo",
        className: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
      },
      "in-progress": {
        label: "In progress",
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
      },
      blocked: {
        label: "Blocked",
        className: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
      },
      done: {
        label: "Done",
        className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
      },
    };
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
        presentation[status].className,
      )}
      data-task-status={status}
    >
      {presentation[status].label}
    </span>
  );
}

export function TaskCard({
  assigneeProfile,
  onOpen,
  task,
  trackName,
}: {
  assigneeProfile?: UserProfile;
  onOpen: () => void;
  task: Task;
  trackName?: string;
}) {
  const overdue = Boolean(
    task.due && task.status !== "done" && task.due.getTime() < Date.now(),
  );
  const assigneeLabel = task.assignee
    ? profileLabel(assigneeProfile, task.assignee)
    : "Unassigned";
  return (
    <article
      className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-muted/30"
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
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <TaskStatusBadge status={task.status} />
        {trackName && (
          <span className="rounded-md bg-muted px-1.5 py-0.5">{trackName}</span>
        )}
        {task.labels.slice(0, 2).map((label) => (
          <span className="rounded-md bg-muted px-1.5 py-0.5" key={label}>
            {label}
          </span>
        ))}
        {task.labels.length > 2 && <span>+{task.labels.length - 2}</span>}
        {task.priority !== "none" && (
          <span
            className={cn(
              "capitalize",
              task.priority === "urgent" && "text-destructive",
            )}
          >
            {task.priority}
          </span>
        )}
        {task.due && (
          <span
            className={cn(
              "inline-flex items-center gap-1",
              overdue && "text-destructive",
            )}
          >
            {overdue ? (
              <CircleAlert className="size-3" />
            ) : (
              <CalendarDays className="size-3" />
            )}
            {task.due.toLocaleDateString("en-CA")}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        {assigneeProfile?.isAgent ? (
          <Bot className="size-3.5" />
        ) : (
          <UserRound className="size-3.5" />
        )}
        <span className="truncate">{assigneeLabel}</span>
        {assigneeProfile?.isAgent && <span>· Agent</span>}
      </div>
    </article>
  );
}
