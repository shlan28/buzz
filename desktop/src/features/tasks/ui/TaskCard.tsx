import { CalendarDays, CircleAlert } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { Task } from "../types";

const STATUS_LABELS = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
} as const;

export function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const overdue = Boolean(
    task.dueDate &&
      task.status !== "done" &&
      task.dueDate < new Date().toISOString().slice(0, 10),
  );
  return (
    <button
      className="w-full rounded-xl border border-border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`task-card-${task.id}`}
      onClick={onOpen}
      type="button"
    >
      <span className="line-clamp-2 text-sm font-medium text-card-foreground">
        {task.title}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5">
          {STATUS_LABELS[task.status]}
        </span>
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
        {task.dueDate ? (
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
            {task.dueDate}
          </span>
        ) : null}
      </span>
    </button>
  );
}
