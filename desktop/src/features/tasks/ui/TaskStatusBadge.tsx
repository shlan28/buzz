import { cn } from "@/shared/lib/cn";
import type { TaskStatus } from "../types";

export const TASK_STATUS_PRESENTATION: Record<
  TaskStatus,
  { label: string; className: string }
> = {
  backlog: {
    label: "Backlog",
    className: "bg-muted text-muted-foreground",
  },
  todo: {
    label: "Todo",
    className:
      "bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300",
  },
  "in-progress": {
    label: "In progress",
    className:
      "bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300",
  },
  blocked: {
    label: "Blocked",
    className:
      "bg-rose-500/10 text-rose-600 dark:bg-rose-400/10 dark:text-rose-300",
  },
  done: {
    label: "Done",
    className:
      "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300",
  },
};

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  const presentation = TASK_STATUS_PRESENTATION[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        presentation.className,
        className,
      )}
      data-task-status={status}
    >
      {presentation.label}
    </span>
  );
}
