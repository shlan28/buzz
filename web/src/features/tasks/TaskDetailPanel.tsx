import { X } from "lucide-react";
import { profileLabel } from "@/features/profile/eventCodec";
import type { UserProfile } from "@/features/profile/types";
import type { Task } from "./types";
import type { TaskExecution } from "./types";
import { TaskStatusBadge } from "./TaskCard";
import { TaskExecutionControl } from "./TaskExecutionControl";

export function TaskDetailPanel({
  assigneeProfile,
  onClose,
  task,
  trackName,
  execution,
  executionError,
  executionPending = false,
  executionStatusAvailable = true,
  onExecute,
  onCancel,
  cancelPending = false,
  cancelError,
}: {
  assigneeProfile?: UserProfile;
  onClose: () => void;
  task?: Task;
  trackName?: string;
  execution?: TaskExecution;
  executionError?: string;
  executionPending?: boolean;
  executionStatusAvailable?: boolean;
  onExecute?: () => void;
  onCancel?: () => void;
  cancelPending?: boolean;
  cancelError?: string;
}) {
  if (!task) return null;
  const assignee = task.assignee
    ? profileLabel(assigneeProfile, task.assignee)
    : "Unassigned";
  return (
    <aside className="absolute inset-y-0 right-0 z-20 w-[380px] border-l border-border bg-background p-5 shadow-xl max-[700px]:w-full">
      <button
        aria-label="Close task detail"
        className="float-right rounded-md p-1 hover:bg-muted"
        onClick={onClose}
        type="button"
      >
        <X className="size-4" />
      </button>
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        Task
      </p>
      <h2 className="mt-2 pr-8 text-xl font-semibold">{task.title}</h2>
      <div className="mt-4">
        <TaskStatusBadge status={task.status} />
      </div>
      <p className="mt-6 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {task.description || "No description."}
      </p>
      <dl className="mt-6 grid grid-cols-[100px_1fr] gap-y-3 text-sm">
        <dt className="text-muted-foreground">Priority</dt>
        <dd className="capitalize">{task.priority}</dd>
        <dt className="text-muted-foreground">Assignee</dt>
        <dd className="truncate">{assignee}</dd>
        <dt className="text-muted-foreground">Track</dt>
        <dd>{trackName ?? "—"}</dd>
        <dt className="text-muted-foreground">Labels</dt>
        <dd>{task.labels.join(", ") || "—"}</dd>
      </dl>
      {onExecute && task.status !== "done" && !task.archived ? (
        <TaskExecutionControl
          agentName={assignee}
          error={executionError}
          execution={execution}
          onExecute={onExecute}
          onCancel={onCancel}
          cancelPending={cancelPending}
          cancelError={cancelError}
          pending={executionPending}
          statusAvailable={executionStatusAvailable}
        />
      ) : null}
    </aside>
  );
}
