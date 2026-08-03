import { CalendarDays, CircleAlert } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { Task, TaskAssignee } from "../types";
import {
  dueTimestampToLocalDate,
  isDueTimestampOverdue,
} from "../lib/taskDates";
import { taskAssigneeFromSelectValue } from "../lib/taskAssigneeSelection";

const STATUS_LABELS = {
  backlog: "Backlog",
  todo: "Todo",
  "in-progress": "In progress",
  blocked: "Blocked",
  done: "Done",
} as const;

export function TaskCard({
  task,
  assignees,
  onOpen,
  onReassign,
}: {
  task: Task;
  assignees?: TaskAssignee[];
  onOpen: () => void;
  onReassign?: (assignee: string | null) => void;
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
      {assignees && onReassign ? (
        <label className="mt-2 block text-xs text-muted-foreground">
          <span className="sr-only">Move {task.title} to</span>
          <select
            aria-label={`Move ${task.title} to`}
            className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
            value={task.assignee ?? ""}
            onChange={(event) =>
              onReassign(taskAssigneeFromSelectValue(event.target.value))
            }
          >
            {assignees.map((assignee) => (
              <option
                disabled={assignee.canAssign === false}
                key={assignee.pubkey ?? "unassigned"}
                value={assignee.pubkey ?? ""}
              >
                {assignee.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </article>
  );
}
